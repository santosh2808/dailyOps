import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Archive, ArrowLeft, ExternalLink, Eye, MoreHorizontal, RefreshCw, RotateCcw, Save, Send, Trash2, TriangleAlert, Undo2 } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import ContentStatusBadge from "@/components/content/ContentStatusBadge";
import ContentPreviewDialog, { type ContentPreviewModel } from "@/components/content/ContentPreviewDialog";
import GoogleSnippet from "@/components/content/GoogleSnippet";
import GalleryField from "@/components/content/GalleryField";
import ImageField from "@/components/content/ImageField";
import KeyResultsField from "@/components/content/KeyResultsField";
import ProductsUsedField, { type ProductUsedRow } from "@/components/content/ProductsUsedField";
import {
  BLOG_CATEGORIES,
  CASE_STUDY_INDUSTRIES,
  DEFAULT_BLOG_BYLINE,
  LIMITS,
  OTHER_INDUSTRY,
  SLUG_PATTERN,
  TYPE_CONFIG,
  errorCodeOf,
  errorsUnder,
  fieldErrorsFrom,
  formatDateTime,
  liveUrl,
  slugify,
  timeAgo,
} from "@/components/content/contentOptions";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/errors";
import { scrollToFirstError } from "@/lib/scrollToFirstError";
import { INDIA_STATES } from "@/lib/indiaStates";
import { useAuth } from "@/context/AuthContext";
import {
  archiveContentPost,
  createContentPost,
  deleteContentPost,
  getContentPost,
  listContentProductOptions,
  listContentWebsites,
  publishContentPost,
  restoreContentPost,
  unpublishContentPost,
  updateContentPost,
} from "@/api/content";
import type {
  CaseStudyKeyResult,
  ContentImage,
  ContentPost,
  ContentPostType,
  ContentProductOption,
  ContentRichTextNode,
  ContentWebsiteOption,
} from "@/types";

// Lazy TipTap chunk
const RichTextEditor = lazy(() => import("@/components/content/RichTextEditor"));

interface FormState {
  formWebsiteId: string;
  title: string;
  slug: string;
  featured: boolean;
  seoTitle: string;
  seoDescription: string;
  excerpt: string;
  coverImage: ContentImage | null;
  // Blog
  category: string;
  tagsText: string;
  byline: string;
  body: ContentRichTextNode | null;
  ogImage: ContentImage | null;
  date: string;
  // Case study
  clientName: string;
  anonymousClientLabel: string;
  clientLogo: ContentImage | null;
  industry: string;
  industryOther: string;
  city: string;
  state: string;
  areaSqFt: string;
  keyResults: CaseStudyKeyResult[];
  challenge: string;
  solution: string;
  results: string;
  quoteText: string;
  quoteName: string;
  quoteDesignation: string;
  gallery: ContentImage[];
  videoUrl: string;
  completedAt: string;
  products: ProductUsedRow[];
}

const emptyForm: FormState = {
  formWebsiteId: "",
  title: "",
  slug: "",
  featured: false,
  seoTitle: "",
  seoDescription: "",
  excerpt: "",
  coverImage: null,
  category: "",
  tagsText: "",
  byline: "",
  body: null,
  ogImage: null,
  date: "",
  clientName: "",
  anonymousClientLabel: "",
  clientLogo: null,
  industry: "",
  industryOther: "",
  city: "",
  state: "",
  areaSqFt: "",
  keyResults: [],
  challenge: "",
  solution: "",
  results: "",
  quoteText: "",
  quoteName: "",
  quoteDesignation: "",
  gallery: [],
  videoUrl: "",
  completedAt: "",
  products: [],
};

function formFromPost(post: ContentPost): FormState {
  const d = post.data ?? {};
  return {
    formWebsiteId: post.formWebsiteId,
    title: post.title,
    slug: post.slug,
    featured: post.featured,
    seoTitle: post.seoTitle ?? "",
    seoDescription: post.seoDescription ?? "",
    excerpt: d.excerpt ?? "",
    coverImage: d.coverImage ?? null,
    category: d.category ?? "",
    tagsText: (d.tags ?? []).join(", "),
    byline: d.byline ?? "",
    body: d.body ?? null,
    ogImage: d.ogImage ?? null,
    date: d.date ?? "",
    clientName: d.clientName ?? "",
    anonymousClientLabel: d.anonymousClientLabel ?? "",
    clientLogo: d.clientLogo ?? null,
    industry: d.industry ?? "",
    industryOther: d.industryOther ?? "",
    city: d.city ?? "",
    state: d.state ?? "",
    areaSqFt: d.areaSqFt != null ? String(d.areaSqFt) : "",
    keyResults: d.keyResults ?? [],
    challenge: d.challenge ?? "",
    solution: d.solution ?? "",
    results: d.results ?? "",
    quoteText: d.quote?.text ?? "",
    quoteName: d.quote?.name ?? "",
    quoteDesignation: d.quote?.designation ?? "",
    gallery: d.gallery ?? [],
    videoUrl: d.videoUrl ?? "",
    completedAt: d.completedAt ?? "",
    products: post.products.map((p) => ({ formWebsiteProductId: p.formWebsiteProductId, quantity: String(p.quantity) })),
  };
}

// Key and alt
function storedImage(image: ContentImage | null) {
  return image ? { key: image.key, alt: image.alt ?? "" } : undefined;
}

// Template payload
function buildData(type: ContentPostType, form: FormState): Record<string, unknown> {
  if (type === "BLOG") {
    return {
      excerpt: form.excerpt,
      coverImage: storedImage(form.coverImage),
      category: form.category,
      tags: form.tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      byline: form.byline,
      body: form.body ?? undefined,
      ogImage: storedImage(form.ogImage),
      date: form.date,
    };
  }
  const quoteFilled = form.quoteText.trim() || form.quoteName.trim() || form.quoteDesignation.trim();
  return {
    excerpt: form.excerpt,
    coverImage: storedImage(form.coverImage),
    clientName: form.clientName,
    anonymousClientLabel: form.anonymousClientLabel,
    clientLogo: storedImage(form.clientLogo),
    industry: form.industry,
    industryOther: form.industry === OTHER_INDUSTRY ? form.industryOther : undefined,
    city: form.city,
    state: form.state,
    areaSqFt: form.areaSqFt.trim() ? Number(form.areaSqFt) : undefined,
    keyResults: form.keyResults,
    challenge: form.challenge,
    solution: form.solution,
    results: form.results,
    quote: quoteFilled ? { text: form.quoteText, name: form.quoteName, designation: form.quoteDesignation } : undefined,
    gallery: form.gallery.map((img) => storedImage(img)),
    videoUrl: form.videoUrl,
    completedAt: form.completedAt,
  };
}

function productsPayload(rows: ProductUsedRow[]) {
  return rows.map((row) => ({ formWebsiteProductId: row.formWebsiteProductId, quantity: Number(row.quantity) }));
}

type Busy = "" | "save" | "publish";
type ConfirmAction = "" | "unpublish" | "archive" | "restore" | "delete" | "leave";

// Post editor
export default function ContentPostEditor({ type }: { type: ContentPostType }) {
  const { id } = useParams<{ id: string }>();
  const isNew = !id;
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const config = TYPE_CONFIG[type];

  const [post, setPost] = useState<ContentPost | null>(null);
  const [websites, setWebsites] = useState<ContentWebsiteOption[]>([]);
  const [productOptions, setProductOptions] = useState<ContentProductOption[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [savedJson, setSavedJson] = useState(JSON.stringify(emptyForm));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState<Busy>("");
  const [conflict, setConflict] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [confirm, setConfirm] = useState<ConfirmAction>("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);

  const dirty = JSON.stringify(form) !== savedJson;
  const status = post?.status ?? "DRAFT";
  const archived = status === "ARCHIVED";
  const published = status === "PUBLISHED";
  // Live page address
  const siteLink = post ? liveUrl(type, post.formWebsite.siteUrl, post.slug) : null;
  const canEdit = post ? hasPermission("Content", "Edit") && !archived : hasPermission("Content", "Create");
  const canPublish = hasPermission("Content", "Publish") && !archived;
  const canArchive = hasPermission("Content", "Delete");

  const applyPost = useCallback((next: ContentPost, { remountEditor = false } = {}) => {
    const nextForm = formFromPost(next);
    setPost(next);
    setForm(nextForm);
    setSavedJson(JSON.stringify(nextForm));
    setErrors({});
    setConflict("");
    if (remountEditor) setEditorKey((k) => k + 1);
  }, []);

  // ── Load ──
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const websiteList = await listContentWebsites();
      setWebsites(websiteList);
      if (id) {
        const loaded = await getContentPost(id);
        if (loaded.type !== type) {
          navigate(`/content/${TYPE_CONFIG[loaded.type].path}/${loaded.id}`, { replace: true });
          return;
        }
        applyPost(loaded, { remountEditor: true });
      } else {
        // User picks website
        const initial = { ...emptyForm };
        setPost(null);
        setForm(initial);
        setSavedJson(JSON.stringify(initial));
        setEditorKey((k) => k + 1);
      }
    } catch (err) {
      setLoadError(
        (err as { response?: { status?: number } })?.response?.status === 404
          ? `This ${config.label.toLowerCase()} no longer exists.`
          : getErrorMessage(err, `Could not load this ${config.label.toLowerCase()}.`),
      );
    } finally {
      setLoading(false);
    }
  }, [id, type, navigate, applyPost, config.label]);

  // Skip reload
  const justCreatedId = useRef<string | null>(null);
  useEffect(() => {
    if (id && justCreatedId.current === id) {
      justCreatedId.current = null;
      return;
    }
    load();
  }, [id, load]);

  useEffect(() => {
    if (type !== "CASE_STUDY" || !form.formWebsiteId) return;
    let cancelled = false;
    listContentProductOptions(form.formWebsiteId)
      .then((options) => !cancelled && setProductOptions(options))
      .catch((err) => toast.error(getErrorMessage(err, "Could not load this website's products.")));
    return () => {
      cancelled = true;
    };
  }, [type, form.formWebsiteId]);

  // Unsaved guard
  const guardRef = useRef(false);
  guardRef.current = dirty && canEdit;
  useEffect(() => {
    // Guard in-app links
    function onClick(e: MouseEvent) {
      if (!guardRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const link = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.origin !== window.location.origin) return;
      if (link.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaveTo(link.pathname + link.search);
      setConfirm("leave");
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function goBack() {
    if (dirty && canEdit) {
      setLeaveTo(null);
      setConfirm("leave");
    } else {
      navigate(`/content/${config.path}`);
    }
  }

  // ── Editing ──
  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "title" && !post && !slugTouched) next.slug = slugify(String(value));
      // Per-website products
      if (key === "formWebsiteId") next.products = [];
      if (key === "industry" && value !== OTHER_INDUSTRY) next.industryOther = "";
      return next;
    });
    if (key === "slug") setSlugTouched(true);
    setErrors((prev) => {
      const name = key === "tagsText" ? "tags" : key.startsWith("quote") ? "quote" : (key as string);
      const remaining = Object.fromEntries(Object.entries(prev).filter(([field]) => field !== name && !field.startsWith(`${name}.`)));
      return Object.keys(remaining).length === Object.keys(prev).length ? prev : remaining;
    });
  }

  function showErrors(next: Record<string, string>) {
    setErrors(next);
    // Scroll to field
    scrollToFirstError(Object.fromEntries(Object.keys(next).map((field) => [field.split(".")[0], true])));
  }

  function validateBeforeSave(): boolean {
    const next: Record<string, string> = {};
    if (!form.formWebsiteId) next.formWebsiteId = "Choose the website this post belongs to";
    if (!form.title.trim()) next.title = "Title is required";
    if (!form.slug) next.slug = "URL name is required";
    else if (!SLUG_PATTERN.test(form.slug)) next.slug = "Use lowercase letters, numbers and single hyphens only";
    if (form.areaSqFt.trim() && !/^\d+$/.test(form.areaSqFt.trim())) next.areaSqFt = "Area must be a whole number of square feet";
    form.products.forEach((row, index) => {
      if (!row.formWebsiteProductId) next[`products.${index}.formWebsiteProductId`] = "Choose a product";
      if (!/^\d+$/.test(row.quantity) || Number(row.quantity) < 1) next[`products.${index}.quantity`] = "Quantity must be a whole number, at least 1";
    });
    if (Object.keys(next).length) {
      showErrors(next);
      return false;
    }
    return true;
  }

  function handleError(err: unknown, fallback: string) {
    const fieldErrors = fieldErrorsFrom(err);
    const code = errorCodeOf(err);
    if (fieldErrors) {
      showErrors(fieldErrors);
      const n = Object.keys(fieldErrors).length;
      toast.error(`${n === 1 ? "1 field needs" : `${n} fields need`} attention.`);
    } else if (code === "STALE") {
      setConflict(getErrorMessage(err, "Someone else changed this post after you opened it."));
    } else if (code === "SLUG_TAKEN" || code === "SLUG_LOCKED") {
      showErrors({ slug: getErrorMessage(err, "This URL name can't be used.") });
    } else if ((err as { response?: { status?: number } })?.response?.status === 404) {
      setConflict("This post no longer exists. Someone may have changed it.");
    } else {
      toast.error(getErrorMessage(err, fallback));
    }
  }

  // ── Actions ──
  async function save({ quiet = false } = {}): Promise<ContentPost | null> {
    if (!validateBeforeSave()) return null;
    const data = buildData(type, form);
    const products = type === "CASE_STUDY" ? productsPayload(form.products) : undefined;
    setBusy("save");
    try {
      let saved: ContentPost;
      if (!post) {
        saved = await createContentPost({
          formWebsiteId: form.formWebsiteId,
          type,
          title: form.title.trim(),
          slug: form.slug,
          featured: form.featured,
          seoTitle: form.seoTitle,
          seoDescription: form.seoDescription,
          data,
          products,
        });
        applyPost(saved);
        justCreatedId.current = saved.id;
        navigate(`/content/${config.path}/${saved.id}`, { replace: true });
      } else {
        saved = await updateContentPost(post.id, {
          version: post.version,
          ...(form.formWebsiteId !== post.formWebsiteId ? { formWebsiteId: form.formWebsiteId } : {}),
          title: form.title.trim(),
          ...(published ? {} : { slug: form.slug }),
          featured: form.featured,
          seoTitle: form.seoTitle,
          seoDescription: form.seoDescription,
          data,
          products,
        });
        applyPost(saved);
      }
      if (!quiet) toast.success(saved.status === "PUBLISHED" ? "Saved. Click \"Update live post\" to put it on the website." : "Draft saved.");
      return saved;
    } catch (err) {
      handleError(err, "Could not save this post.");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function publish() {
    let current = post;
    if (!current || dirty) {
      current = await save({ quiet: true });
      if (!current) return;
    }
    setBusy("publish");
    try {
      const wasPublished = current.status === "PUBLISHED";
      const updated = await publishContentPost(current.id, current.version);
      applyPost(updated);
      toast.success(wasPublished ? "Live post updated. The website shows it within a minute." : `${config.label} published. It appears on the website within a minute.`);
    } catch (err) {
      handleError(err, "Could not publish this post.");
    } finally {
      setBusy("");
    }
  }

  async function runConfirmed() {
    if (confirm === "leave") {
      guardRef.current = false;
      navigate(leaveTo ?? `/content/${config.path}`);
      return;
    }
    if (!post || !confirm) return;
    if (confirm === "delete") {
      await deleteContentPost(post.id); // ConfirmDialog shows errors
      guardRef.current = false;
      toast.success(`${config.label} deleted.`);
      navigate(`/content/${config.path}`, { replace: true });
      return;
    }
    const actions = {
      unpublish: { run: unpublishContentPost, done: "Taken off the website." },
      archive: { run: archiveContentPost, done: "Archived." },
      restore: { run: restoreContentPost, done: "Restored as a draft." },
    };
    const action = actions[confirm];
    try {
      const updated = await action.run(post.id, post.version);
      applyPost(updated, { remountEditor: true });
      toast.success(action.done);
    } catch (err) {
      if (errorCodeOf(err) === "STALE") {
        setConflict(getErrorMessage(err, "Someone else changed this post after you opened it."));
        return;
      }
      throw err; // ConfirmDialog shows message
    }
  }

  // Ctrl/Cmd+S
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (canEdit && !busy) saveRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canEdit, busy]);

  const previewModel: ContentPreviewModel = useMemo(() => {
    const data = buildData(type, form) as ContentPreviewModel["data"];
    // Keep image urls
    return {
      type,
      title: form.title,
      slug: form.slug,
      seoTitle: form.seoTitle,
      seoDescription: form.seoDescription,
      data: {
        ...data,
        coverImage: form.coverImage ?? undefined,
        gallery: form.gallery,
        body: form.body ?? undefined,
        tags: type === "BLOG" ? (data.tags ?? []).map((t) => t.toLowerCase()) : undefined,
      },
      products: form.products
        .filter((row) => row.formWebsiteProductId)
        .map((row) => ({
          label: productOptions.find((o) => o.id === row.formWebsiteProductId)?.label ?? "Product",
          quantity: Number(row.quantity) || 0,
        })),
    };
  }, [type, form, productOptions]);

  const fieldError = (path: string) =>
    errorsUnder(errors, path).map((message) => (
      <p key={message} className="text-xs text-destructive">
        {message}
      </p>
    ));
  const counter = (value: string, max: number) => (
    <span className={value.length > max ? "text-destructive" : "text-muted-foreground"}>
      {value.length}/{max}
    </span>
  );
  const website = websites.find((w) => w.id === form.formWebsiteId);

  return (
    <div className="app-shell bg-app-grid">
      <Sidebar />
      <div className="app-shell-content">
        <Topbar title={isNew ? `New ${config.label}` : `Edit ${config.label}`} />
        <main className="app-shell-main">
          {loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Spinner /> Loading {config.label.toLowerCase()}...
            </div>
          ) : loadError ? (
            <div className="mx-auto max-w-xl space-y-3 py-10 text-center">
              <p className="text-sm text-destructive">{loadError}</p>
              <div className="flex justify-center gap-2">
                <Button variant="outline" onClick={load}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Try again
                </Button>
                <Button variant="outline" onClick={() => navigate(`/content/${config.path}`)}>
                  Back to {config.plural}
                </Button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
              className="mx-auto max-w-6xl space-y-4"
            >
              {/* Action bar */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={goBack}>
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    {config.plural}
                  </Button>
                  <ContentStatusBadge status={status} hasUnpublishedChanges={post?.hasUnpublishedChanges} />
                  {dirty && canEdit ? (
                    <span className="text-xs text-amber-700">Unsaved changes</span>
                  ) : (
                    <span className="text-xs text-muted-foreground" title={post ? formatDateTime(post.updatedAt) : undefined}>
                      {post ? `Saved ${timeAgo(post.updatedAt)} by ${post.updatedBy?.name ?? post.author.name}` : "Not saved yet"}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => setPreviewOpen(true)}>
                    <Eye className="mr-2 h-4 w-4" />
                    Preview
                  </Button>
                  {canEdit && (
                    <Button type="submit" variant="outline" disabled={!!busy || (!dirty && !!post)} title="Save draft (Ctrl+S)">
                      {busy === "save" ? <Spinner className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
                      {busy === "save" ? "Saving..." : "Save draft"}
                    </Button>
                  )}
                  {canPublish && (canEdit || (post && !dirty)) && (
                    <Button type="button" onClick={publish} disabled={!!busy || (published && !post?.hasUnpublishedChanges && !dirty)}>
                      {busy === "publish" ? <Spinner className="mr-2 h-4 w-4" /> : <Send className="mr-2 h-4 w-4" />}
                      {busy === "publish" ? "Publishing..." : published ? "Update live post" : "Publish"}
                    </Button>
                  )}
                  {post && (
                    <DropdownMenu
                      trigger={
                        <Button type="button" variant="outline" size="icon" title="More actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      }
                    >
                      <DropdownMenuItem
                        icon={ExternalLink}
                        disabled={!published || !siteLink}
                        onSelect={() => siteLink && window.open(siteLink, "_blank", "noopener,noreferrer")}
                      >
                        <span>
                          View on website
                          {(!published || !siteLink) && (
                            <span className="block text-xs text-muted-foreground">
                              {!published ? "Available once published" : "Add the website address in Web Form Configuration"}
                            </span>
                          )}
                        </span>
                      </DropdownMenuItem>
                      {canPublish && published && (
                        <DropdownMenuItem icon={Undo2} onSelect={() => setConfirm("unpublish")}>
                          Unpublish
                        </DropdownMenuItem>
                      )}
                      {canArchive && !archived && (
                        <DropdownMenuItem icon={Archive} destructive onSelect={() => setConfirm("archive")}>
                          Archive
                        </DropdownMenuItem>
                      )}
                      {canArchive && archived && (
                        <DropdownMenuItem icon={RotateCcw} onSelect={() => setConfirm("restore")}>
                          Restore as draft
                        </DropdownMenuItem>
                      )}
                      {canArchive && archived && (
                        <DropdownMenuItem icon={Trash2} destructive onSelect={() => setConfirm("delete")}>
                          Delete
                        </DropdownMenuItem>
                      )}
                    </DropdownMenu>
                  )}
                </div>
              </div>

              {conflict && (
                <div className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
                  <p className="flex items-start gap-2">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    {conflict} Reloading discards your unsaved changes here.
                  </p>
                  <Button type="button" variant="outline" size="sm" onClick={load}>
                    Reload
                  </Button>
                </div>
              )}
              {archived && (
                <p className="rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
                  This {config.label.toLowerCase()} is archived — it is not on the website and can't be edited.
                  {canArchive ? " Use More actions → Restore as draft to work on it again." : ""}
                </p>
              )}

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {/* Main column */}
                <div className="space-y-4 lg:col-span-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Basics</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="title" className="flex justify-between">
                          <span>Title *</span>
                          {counter(form.title, LIMITS.title)}
                        </Label>
                        <Input
                          id="title"
                          value={form.title}
                          maxLength={LIMITS.title}
                          disabled={!canEdit}
                          onChange={(e) => update("title", e.target.value)}
                          placeholder={type === "BLOG" ? "How to choose the right HVLS fan size" : "Cooling a 40,000 sq ft textile mill in Hyderabad"}
                        />
                        {fieldError("title")}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="slug">URL name *</Label>
                        <Input
                          id="slug"
                          value={form.slug}
                          maxLength={LIMITS.slug}
                          disabled={!canEdit || published}
                          onChange={(e) => update("slug", e.target.value.toLowerCase())}
                        />
                        <p className="text-xs text-muted-foreground">
                          {published
                            ? "Locked while published, so existing links never break. Unpublish to change it."
                            : `Becomes /${config.websitePath}/${form.slug || "url-name"}. Lowercase words joined by hyphens.`}
                        </p>
                        {fieldError("slug")}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="excerpt" className="flex justify-between">
                          <span>Summary (shown on the card) *</span>
                          {counter(form.excerpt, LIMITS.excerpt)}
                        </Label>
                        <Textarea
                          id="excerpt"
                          rows={3}
                          value={form.excerpt}
                          disabled={!canEdit}
                          onChange={(e) => update("excerpt", e.target.value)}
                        />
                        {fieldError("excerpt")}
                      </div>
                    </CardContent>
                  </Card>

                  {type === "BLOG" ? (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Article *</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2" data-error-key="body">
                        <Suspense
                          fallback={
                            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                              <Spinner />
                            </div>
                          }
                        >
                          <RichTextEditor
                            key={editorKey}
                            id="body"
                            websiteId={form.formWebsiteId}
                            value={form.body}
                            onChange={(body) => update("body", body)}
                            disabled={!canEdit}
                            invalid={Boolean(errors.body)}
                          />
                        </Suspense>
                        {fieldError("body")}
                      </CardContent>
                    </Card>
                  ) : (
                    <>
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">The story</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {(
                            [
                              ["challenge", "The challenge *"],
                              ["solution", "Our solution *"],
                              ["results", "The results *"],
                            ] as const
                          ).map(([key, label]) => (
                            <div key={key} className="space-y-2">
                              <Label htmlFor={key} className="flex justify-between">
                                <span>{label}</span>
                                {counter(form[key], LIMITS.caseStudyText)}
                              </Label>
                              <Textarea
                                id={key}
                                rows={5}
                                value={form[key]}
                                disabled={!canEdit}
                                onChange={(e) => update(key, e.target.value)}
                              />
                              {fieldError(key)}
                            </div>
                          ))}
                          <p className="text-xs text-muted-foreground">Plain text. Leave a blank line between paragraphs.</p>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Products &amp; results</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                          <ProductsUsedField
                            options={productOptions}
                            value={form.products}
                            onChange={(rows) => update("products", rows)}
                            errors={errors}
                            disabled={!canEdit}
                          />
                          <KeyResultsField
                            value={form.keyResults}
                            onChange={(rows) => update("keyResults", rows)}
                            errors={errors}
                            disabled={!canEdit}
                          />
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Client quote (optional)</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-error-key="quote">
                          <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor="quoteText">Quote</Label>
                            <Textarea
                              id="quoteText"
                              rows={3}
                              maxLength={500}
                              value={form.quoteText}
                              disabled={!canEdit}
                              onChange={(e) => update("quoteText", e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="quoteName">Name</Label>
                            <Input id="quoteName" maxLength={80} value={form.quoteName} disabled={!canEdit} onChange={(e) => update("quoteName", e.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="quoteDesignation">Designation</Label>
                            <Input
                              id="quoteDesignation"
                              maxLength={80}
                              value={form.quoteDesignation}
                              disabled={!canEdit}
                              onChange={(e) => update("quoteDesignation", e.target.value)}
                            />
                          </div>
                          <div className="sm:col-span-2">{fieldError("quote")}</div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Project photos &amp; video</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <GalleryField
                            websiteId={form.formWebsiteId}
                            value={form.gallery}
                            onChange={(gallery) => update("gallery", gallery)}
                            errors={errors}
                            disabled={!canEdit}
                          />
                          <div className="space-y-2">
                            <Label htmlFor="videoUrl">Video (YouTube or Vimeo link)</Label>
                            <Input
                              id="videoUrl"
                              value={form.videoUrl}
                              disabled={!canEdit}
                              placeholder="https://www.youtube.com/watch?v=…"
                              onChange={(e) => update("videoUrl", e.target.value)}
                            />
                            {fieldError("videoUrl")}
                          </div>
                        </CardContent>
                      </Card>
                    </>
                  )}
                </div>

                {/* Side column */}
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Publishing</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="space-y-2">
                        <Label htmlFor="formWebsiteId">Website *</Label>
                        <Select
                          id="formWebsiteId"
                          value={form.formWebsiteId}
                          disabled={!canEdit || published}
                          onChange={(e) => update("formWebsiteId", e.target.value)}
                        >
                          <option value="">Choose a website</option>
                          {websites.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name}
                              {w.status === "INACTIVE" ? " (inactive)" : ""}
                            </option>
                          ))}
                        </Select>
                        {published && <p className="text-xs text-muted-foreground">Unpublish to move it to another website.</p>}
                        {website?.status === "INACTIVE" && (
                          <p className="text-xs text-amber-700">This website is inactive — its public content API returns nothing.</p>
                        )}
                        {fieldError("formWebsiteId")}
                      </div>
                      <label className="flex items-center gap-2">
                        <Checkbox checked={form.featured} disabled={!canEdit} onChange={(e) => update("featured", e.target.checked)} />
                        Featured (highlighted on the website)
                      </label>
                      {post && (
                        <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 border-t border-slate-100 pt-3 text-xs">
                          <dt className="text-muted-foreground">Author</dt>
                          <dd>{post.author.name}</dd>
                          <dt className="text-muted-foreground">Created</dt>
                          <dd>{formatDateTime(post.createdAt)}</dd>
                          <dt className="text-muted-foreground">Last edited</dt>
                          <dd>
                            {formatDateTime(post.updatedAt)}
                            {post.updatedBy ? ` by ${post.updatedBy.name}` : ""}
                          </dd>
                          <dt className="text-muted-foreground">First published</dt>
                          <dd>{formatDateTime(post.publishedAt)}</dd>
                          <dt className="text-muted-foreground">Last published</dt>
                          <dd>{formatDateTime(post.lastPublishedAt)}</dd>
                        </dl>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="space-y-4 pt-6">
                      <ImageField
                        id="coverImage"
                        label="Cover image"
                        required
                        shareable
                        websiteId={form.formWebsiteId}
                        value={form.coverImage}
                        onChange={(img) => update("coverImage", img)}
                        errors={errors}
                        errorPath="coverImage"
                        disabled={!canEdit}
                        help="Also used as the link-preview picture (WhatsApp, LinkedIn)."
                      />
                    </CardContent>
                  </Card>

                  {type === "BLOG" ? (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Details</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="category">Category *</Label>
                          <Select id="category" value={form.category} disabled={!canEdit} onChange={(e) => update("category", e.target.value)}>
                            <option value="">Choose a category</option>
                            {BLOG_CATEGORIES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </Select>
                          {fieldError("category")}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="tags">Tags</Label>
                          <Input
                            id="tags"
                            value={form.tagsText}
                            disabled={!canEdit}
                            placeholder="hvls, warehouse cooling"
                            onChange={(e) => update("tagsText", e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground">Comma separated, up to {LIMITS.tags}. Saved in lowercase.</p>
                          {fieldError("tags")}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="byline">Byline</Label>
                          <Input
                            id="byline"
                            value={form.byline}
                            maxLength={LIMITS.byline}
                            disabled={!canEdit}
                            placeholder={DEFAULT_BLOG_BYLINE}
                            onChange={(e) => update("byline", e.target.value)}
                          />
                          {fieldError("byline")}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="date">Date shown on the post</Label>
                          <Input id="date" type="date" value={form.date} disabled={!canEdit} onChange={(e) => update("date", e.target.value)} />
                          <p className="text-xs text-muted-foreground">Optional. Defaults to the day it's first published.</p>
                          {fieldError("date")}
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Project details</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="industry">Industry *</Label>
                          <Select id="industry" value={form.industry} disabled={!canEdit} onChange={(e) => update("industry", e.target.value)}>
                            <option value="">Choose an industry</option>
                            {CASE_STUDY_INDUSTRIES.map((i) => (
                              <option key={i} value={i}>
                                {i}
                              </option>
                            ))}
                          </Select>
                          {fieldError("industry")}
                        </div>
                        {form.industry === OTHER_INDUSTRY && (
                          <div className="space-y-2">
                            <Label htmlFor="industryOther">Industry name *</Label>
                            <Input
                              id="industryOther"
                              maxLength={60}
                              value={form.industryOther}
                              disabled={!canEdit}
                              placeholder="e.g. Cold storage"
                              onChange={(e) => update("industryOther", e.target.value)}
                            />
                            {fieldError("industryOther")}
                          </div>
                        )}
                        <div className="space-y-2">
                          <Label htmlFor="clientName">Client name</Label>
                          <Input
                            id="clientName"
                            maxLength={100}
                            value={form.clientName}
                            disabled={!canEdit}
                            onChange={(e) => update("clientName", e.target.value)}
                          />
                          {fieldError("clientName")}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="anonymousClientLabel">…or anonymous label</Label>
                          <Input
                            id="anonymousClientLabel"
                            maxLength={100}
                            value={form.anonymousClientLabel}
                            disabled={!canEdit}
                            placeholder="A leading textile mill"
                            onChange={(e) => update("anonymousClientLabel", e.target.value)}
                          />
                          {fieldError("anonymousClientLabel")}
                        </div>
                        <ImageField
                          id="clientLogo"
                          label="Client logo"
                          websiteId={form.formWebsiteId}
                          value={form.clientLogo}
                          onChange={(img) => update("clientLogo", img)}
                          errors={errors}
                          errorPath="clientLogo"
                          disabled={!canEdit}
                        />
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label htmlFor="city">City *</Label>
                            <Input id="city" maxLength={60} value={form.city} disabled={!canEdit} onChange={(e) => update("city", e.target.value)} />
                            {fieldError("city")}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="state">State *</Label>
                            <Select id="state" value={form.state} disabled={!canEdit} onChange={(e) => update("state", e.target.value)}>
                              <option value="">Choose</option>
                              {INDIA_STATES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </Select>
                            {fieldError("state")}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label htmlFor="areaSqFt">Area (sq ft)</Label>
                            <Input
                              id="areaSqFt"
                              inputMode="numeric"
                              value={form.areaSqFt}
                              disabled={!canEdit}
                              onChange={(e) => update("areaSqFt", e.target.value.replace(/[^\d]/g, ""))}
                            />
                            {fieldError("areaSqFt")}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="completedAt">Completed</Label>
                            <Input
                              id="completedAt"
                              type="date"
                              value={form.completedAt}
                              disabled={!canEdit}
                              onChange={(e) => update("completedAt", e.target.value)}
                            />
                            {fieldError("completedAt")}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Google &amp; link previews</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="seoTitle" className="flex justify-between">
                          <span>Google title</span>
                          {counter(form.seoTitle, LIMITS.seoTitle)}
                        </Label>
                        <Input
                          id="seoTitle"
                          value={form.seoTitle}
                          disabled={!canEdit}
                          placeholder="Defaults to the title"
                          onChange={(e) => update("seoTitle", e.target.value)}
                        />
                        {fieldError("seoTitle")}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="seoDescription" className="flex justify-between">
                          <span>Google description</span>
                          {counter(form.seoDescription, LIMITS.seoDescription)}
                        </Label>
                        <Textarea
                          id="seoDescription"
                          rows={3}
                          value={form.seoDescription}
                          disabled={!canEdit}
                          placeholder="Defaults to the summary"
                          onChange={(e) => update("seoDescription", e.target.value)}
                        />
                        {fieldError("seoDescription")}
                      </div>
                      <GoogleSnippet
                        path={`${config.websitePath} › ${form.slug || "url-name"}`}
                        title={form.seoTitle || form.title}
                        description={form.seoDescription || form.excerpt}
                      />
                      {type === "BLOG" && (
                        <ImageField
                          id="ogImage"
                          label="Link-preview image"
                          shareable
                          websiteId={form.formWebsiteId}
                          value={form.ogImage}
                          onChange={(img) => update("ogImage", img)}
                          errors={errors}
                          errorPath="ogImage"
                          disabled={!canEdit}
                          help="Optional. Defaults to the cover image."
                        />
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </form>
          )}
        </main>
      </div>

      <ContentPreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} preview={previewModel} />
      <ConfirmDialog
        open={confirm !== ""}
        onOpenChange={(open) => !open && setConfirm("")}
        title={
          {
            "": "",
            leave: "Discard unsaved changes?",
            unpublish: `Unpublish this ${config.label.toLowerCase()}?`,
            archive: `Archive this ${config.label.toLowerCase()}?`,
            restore: `Restore this ${config.label.toLowerCase()}?`,
            delete: `Delete this ${config.label.toLowerCase()} permanently?`,
          }[confirm]
        }
        description={
          {
            "": "",
            leave: "Your changes since the last save will be lost.",
            unpublish: "It comes off the website within about a minute. The draft and its first-publish date are kept.",
            archive: "It comes off the website (if live) and is hidden from the list. You can restore it later as a draft.",
            restore: "It comes back as a draft. Publish it again to put it back on the website.",
            delete: "It is removed from DailyOps and the database, and its URL name becomes free again. This can't be undone.",
          }[confirm]
        }
        confirmLabel={{ "": "", leave: "Discard", unpublish: "Unpublish", archive: "Archive", restore: "Restore", delete: "Delete" }[confirm]}
        confirmingLabel="Working..."
        onConfirm={runConfirmed}
      />
    </div>
  );
}
