import { useState } from "react";
import { Calendar, Clock, MapPin, Monitor, Quote, Smartphone } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import RichTextContent from "./RichTextContent";
import GoogleSnippet from "./GoogleSnippet";
import { DEFAULT_BLOG_BYLINE, TYPE_CONFIG, industryLabel } from "./contentOptions";
import type { BlogData, CaseStudyData, ContentPostType, ContentRichTextNode } from "@/types";

export interface ContentPreviewModel {
  type: ContentPostType;
  title: string;
  slug: string;
  seoTitle: string;
  seoDescription: string;
  data: BlogData & CaseStudyData;
  products: { label: string; quantity: number }[];
}

interface ContentPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: ContentPreviewModel;
}

// Post preview
export default function ContentPreviewDialog({ open, onOpenChange, preview }: ContentPreviewDialogProps) {
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const { type, data } = preview;
  const config = TYPE_CONFIG[type];
  const words = countWords(data.body);
  const googleTitle = preview.seoTitle || preview.title || "Untitled";
  const googleDescription = preview.seoDescription || data.excerpt || "";
  const location = [data.city, data.state].filter(Boolean).join(", ");
  const client = data.clientName || data.anonymousClientLabel;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)} size="xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-8">
            <DialogTitle>Preview</DialogTitle>
            <div className="inline-flex rounded-md border border-input p-0.5">
              {(["desktop", "phone"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-label={d === "desktop" ? "Desktop width" : "Phone width"}
                  onClick={() => setDevice(d)}
                  className={cn("rounded px-2 py-1", device === d ? "bg-slate-100 text-slate-900" : "text-muted-foreground")}
                >
                  {d === "desktop" ? <Monitor className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
                </button>
              ))}
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-6 overflow-y-auto">
          <section>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Google search result</p>
            <GoogleSnippet
              path={`${config.websitePath} › ${preview.slug || "url-name"}`}
              title={googleTitle}
              description={googleDescription}
            />
          </section>

          <section>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">List card</p>
            <div className="w-72 overflow-hidden rounded-lg border border-input bg-white">
              <div className="aspect-[16/9] bg-slate-100">
                {data.coverImage?.url && <img src={data.coverImage.url} alt={data.coverImage.alt ?? ""} className="h-full w-full object-cover" />}
              </div>
              <div className="space-y-1 p-3">
                <Badge variant="orange">{type === "BLOG" ? data.category || "Category" : industryLabel(data) || "Industry"}</Badge>
                <p className="font-semibold text-slate-900">{preview.title || "Untitled"}</p>
                <p className="line-clamp-3 text-sm text-slate-600">{data.excerpt}</p>
              </div>
            </div>
          </section>

          <section>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Page</p>
            <div className={cn("mx-auto overflow-hidden rounded-lg border border-input bg-white transition-[max-width]", device === "phone" ? "max-w-[390px]" : "max-w-full")}>
              {data.coverImage?.url && <img src={data.coverImage.url} alt={data.coverImage.alt ?? ""} className="max-h-72 w-full object-cover" />}
              <article className="space-y-4 p-5">
                <Badge variant="orange">{type === "BLOG" ? data.category || "Category" : industryLabel(data) || "Industry"}</Badge>
                <h1 className="text-2xl font-bold text-slate-900">{preview.title || "Untitled"}</h1>
                {type === "BLOG" ? (
                  <>
                    <p className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>By {data.byline || DEFAULT_BLOG_BYLINE}</span>
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {data.date || "Date of first publish"}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {Math.max(1, Math.round(words / 200))} min read
                      </span>
                    </p>
                    {data.excerpt && <p className="text-base text-slate-600">{data.excerpt}</p>}
                    <RichTextContent doc={data.body} />
                    {data.tags && data.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {data.tags.map((tag) => (
                          <Badge key={tag} variant="muted">
                            #{tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      {client && <span>{client}</span>}
                      {location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {location}
                        </span>
                      )}
                      {data.areaSqFt && <span>{data.areaSqFt.toLocaleString()} sq ft</span>}
                      {data.completedAt && <span>Completed {data.completedAt}</span>}
                    </p>
                    {data.excerpt && <p className="text-base text-slate-600">{data.excerpt}</p>}
                    {data.keyResults && data.keyResults.length > 0 && (
                      <div className={cn("grid gap-2", device === "phone" ? "grid-cols-2" : "grid-cols-4")}>
                        {data.keyResults.map((r, i) => (
                          <div key={i} className="rounded-md bg-orange/10 p-3 text-center">
                            <p className="text-xl font-bold text-orange">{r.value}</p>
                            <p className="text-xs text-slate-600">{r.label}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {[
                      ["The challenge", data.challenge],
                      ["Our solution", data.solution],
                      ["The results", data.results],
                    ].map(([heading, text]) =>
                      text ? (
                        <div key={heading} className="space-y-2">
                          <h2 className="text-lg font-semibold text-slate-900">{heading}</h2>
                          {paragraphs(text).map((p, i) => (
                            <p key={i} className="text-[15px] leading-7 text-slate-700">
                              {p}
                            </p>
                          ))}
                        </div>
                      ) : null,
                    )}
                    {preview.products.length > 0 && (
                      <div className="space-y-1">
                        <h2 className="text-lg font-semibold text-slate-900">Products used</h2>
                        <ul className="list-disc pl-6 text-sm text-slate-700">
                          {preview.products.map((p) => (
                            <li key={p.label}>
                              {p.quantity} × {p.label}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {data.quote?.text && (
                      <blockquote className="rounded-md bg-slate-50 p-4">
                        <Quote className="mb-1 h-4 w-4 text-orange" />
                        <p className="italic text-slate-700">{data.quote.text}</p>
                        <p className="mt-2 text-sm font-medium text-slate-900">
                          {data.quote.name}
                          {data.quote.designation && <span className="font-normal text-muted-foreground">, {data.quote.designation}</span>}
                        </p>
                      </blockquote>
                    )}
                    {data.gallery && data.gallery.length > 0 && (
                      <div className={cn("grid gap-2", device === "phone" ? "grid-cols-2" : "grid-cols-3")}>
                        {data.gallery.map((img) =>
                          img.url ? <img key={img.key} src={img.url} alt={img.alt ?? ""} className="aspect-[4/3] w-full rounded object-cover" /> : null,
                        )}
                      </div>
                    )}
                  </>
                )}
              </article>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Text to paragraphs
function paragraphs(text: string): string[] {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function countWords(doc?: ContentRichTextNode | null): number {
  if (!doc) return 0;
  const text: string[] = [];
  const walk = (node: ContentRichTextNode) => {
    if (node.text) text.push(node.text);
    node.content?.forEach(walk);
  };
  walk(doc);
  return text.join(" ").split(/\s+/).filter(Boolean).length;
}
