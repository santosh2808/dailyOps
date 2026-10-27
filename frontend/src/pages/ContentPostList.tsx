import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink, ImageOff, Pencil, Plus, RefreshCw, Star } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import ContentStatusBadge from "@/components/content/ContentStatusBadge";
import ContentFiltersBar, {
  emptyContentFilters,
  type ContentFilters,
} from "@/components/content/ContentFiltersBar";
import { STATUS_TABS, TYPE_CONFIG, formatDateTime, liveUrl, timeAgo } from "@/components/content/contentOptions";
import TruncatedText from "@/components/shared/TruncatedText";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errors";
import { listContentPostCounts, listContentPosts, listContentWebsites, type ContentPostListParams } from "@/api/content";
import type { ContentPostCounts, ContentPostListItem, ContentPostType, ContentWebsiteOption } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { useSessionFilters } from "@/hooks/useSessionFilters";

const PAGE_SIZE = 20;

// Post list
export default function ContentPostList({ type }: { type: ContentPostType }) {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const config = TYPE_CONFIG[type];

  const [posts, setPosts] = useState<ContentPostListItem[]>([]);
  const [counts, setCounts] = useState<ContentPostCounts | null>(null);
  const [websites, setWebsites] = useState<ContentWebsiteOption[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [storedFilters, setFilters] = useSessionFilters<ContentFilters>(
    `dailyops.filters.content.v2.${config.path}`,
    null,
    emptyContentFilters,
  );
  // Fill missing keys
  const filters: ContentFilters = { ...emptyContentFilters, ...storedFilters };
  const [debouncedFilters, setDebouncedFilters] = useState<ContentFilters>(filters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    listContentWebsites()
      .then((list) => setWebsites(list.filter((w) => w.status === "ACTIVE")))
      .catch((err) => toast.error(getErrorMessage(err, "Failed to load websites.")));
  }, []);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError("");
    const f = debouncedFilters;
    const scope: ContentPostListParams = {
      type,
      formWebsiteId: f.websiteId || undefined,
      search: f.search || undefined,
      category: type === "BLOG" ? f.topic || undefined : undefined,
      industry: type === "CASE_STUDY" ? f.topic || undefined : undefined,
      featured: f.featured ? true : undefined,
    };
    try {
      const [res, tabCounts] = await Promise.all([
        listContentPosts({
          ...scope,
          page,
          limit: PAGE_SIZE,
          sort: f.sort,
          status: f.tab === "DRAFT" || f.tab === "PUBLISHED" || f.tab === "ARCHIVED" ? f.tab : undefined,
          hasUnpublishedChanges: f.tab === "UNPUBLISHED" ? true : undefined,
        }),
        listContentPostCounts(scope),
      ]);
      setPosts(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
      setCounts(tabCounts);
    } catch (err) {
      const message = getErrorMessage(err, `Failed to load ${config.plural.toLowerCase()}.`);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedFilters, type, config.plural]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // Debounced filters
  const filtersKey = JSON.stringify(filters);
  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedFilters(JSON.parse(filtersKey) as ContentFilters);
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [filtersKey]);

  const noun = config.plural.toLowerCase();
  const newPostUrl = `/content/${config.path}/new`;

  return (
    <div className="app-shell bg-app-grid">
      <Sidebar />
      <div className="app-shell-content">
        <Topbar title={config.plural} />
        <main className="app-shell-main app-shell-main-list">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
            <ContentFiltersBar type={type} websites={websites} filters={filters} onChange={setFilters} />
            <div className="app-page-actions flex shrink-0 flex-wrap gap-2">
              <Button variant="outline" size="icon" title="Refresh list" aria-label="Refresh list" onClick={fetchPosts} disabled={loading}>
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              </Button>
              {hasPermission("Content", "Create") && (
                <Button onClick={() => navigate(newPostUrl)}>
                  <Plus className="mr-2 h-4 w-4" />
                  New {config.label}
                </Button>
              )}
            </div>
          </div>

          <div className="mb-3 flex flex-wrap gap-1 border-b border-slate-200" role="tablist" aria-label="Filter by status">
            {STATUS_TABS.map((t) => (
              <button
                key={t.value || "all"}
                type="button"
                role="tab"
                aria-selected={filters.tab === t.value}
                onClick={() => setFilters({ ...filters, tab: t.value })}
                className={cn(
                  "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  filters.tab === t.value
                    ? "border-orange text-orange"
                    : "border-transparent text-muted-foreground hover:text-slate-900",
                )}
              >
                {t.label}
                <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{counts ? counts[t.count] : "–"}</span>
              </button>
            ))}
          </div>

          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

          <Table fillHeightOnMobile>
            <TableHeader>
              <TableRow>
                <TableHead className="hidden w-24 sm:table-cell">Cover</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Website</TableHead>
                <TableHead className="hidden md:table-cell">Last edited</TableHead>
                <TableHead className="hidden xl:table-cell">Published</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && posts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Spinner /> Loading {noun}...
                    </span>
                  </TableCell>
                </TableRow>
              ) : posts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    {counts?.all === 0 && !filters.tab && hasPermission("Content", "Create")
                      ? `No ${noun} yet. Click "New ${config.label}" to write one — it stays a draft until you publish it.`
                      : `No ${noun} match these filters.`}
                  </TableCell>
                </TableRow>
              ) : (
                posts.map((post) => (
                  <TableRow
                    key={post.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/content/${config.path}/${post.id}`)}
                  >
                    <TableCell className="hidden sm:table-cell">
                      <div className="flex h-12 w-20 items-center justify-center overflow-hidden rounded bg-slate-100">
                        {post.coverImage?.url ? (
                          <img src={post.coverImage.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <ImageOff className="h-4 w-4 text-muted-foreground" aria-hidden />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 font-medium text-slate-900">
                        {post.featured && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="Featured" />}
                        <TruncatedText text={post.title} />
                      </div>
                      <p className="text-xs text-muted-foreground">/{config.websitePath}/{post.slug}</p>
                    </TableCell>
                    <TableCell>
                      <ContentStatusBadge status={post.status} hasUnpublishedChanges={post.hasUnpublishedChanges} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{post.formWebsite.name}</TableCell>
                    <TableCell className="hidden md:table-cell" title={formatDateTime(post.updatedAt)}>
                      <p>{timeAgo(post.updatedAt)}</p>
                      <p className="text-xs text-muted-foreground">by {post.updatedBy?.name ?? post.author.name}</p>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">{formatDateTime(post.publishedAt)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {post.status === "PUBLISHED" && liveUrl(type, post.formWebsite.siteUrl, post.slug) && (
                          <a
                            href={liveUrl(type, post.formWebsite.siteUrl, post.slug)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="View on website"
                            aria-label={`View "${post.title}" on the website`}
                            className={buttonVariants({ variant: "ghost", size: "icon" })}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          title={`Open ${config.label.toLowerCase()}`}
                          onClick={() => navigate(`/content/${config.path}/${post.id}`)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-sm text-muted-foreground">
              {total === 0
                ? `0 ${noun}`
                : `Showing ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, total)} of ${total} ${noun}`}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
