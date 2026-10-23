import type { BadgeProps } from "@/components/ui/badge";
import type { ContentPostSort } from "@/api/content";
import type { ContentFieldError, ContentPostCounts, ContentPostStatus, ContentPostType } from "@/types";

// Mirrors backend constants
export const BLOG_CATEGORIES = ["Guides", "Buying Guide", "Technology", "Energy Savings", "Applications", "News"];

export const CASE_STUDY_INDUSTRIES = [
  "Warehouse",
  "Factory",
  "Workshop",
  "Outdoor",
  "Commercial",
  "Institution",
  "Agriculture",
  "Sports & Events",
  "Other",
];

// Needs custom name
export const OTHER_INDUSTRY = "Other";

// Shown industry
export function industryLabel(data: { industry?: string; industryOther?: string }): string {
  return data.industry === OTHER_INDUSTRY && data.industryOther ? data.industryOther : data.industry ?? "";
}

export const DEFAULT_BLOG_BYLINE = "Spyro Fans Team";

export const LIMITS = {
  title: 120,
  slug: 80,
  excerpt: 280,
  seoTitle: 70,
  seoDescription: 160,
  imageAlt: 150,
  tags: 10,
  byline: 80,
  caseStudyText: 2000,
  keyResults: 4,
  gallery: 12,
  products: 20,
};

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Per-type routes/labels
export const TYPE_CONFIG: Record<
  ContentPostType,
  { path: string; label: string; plural: string; websitePath: string }
> = {
  BLOG: { path: "blogs", label: "Blog", plural: "Blogs", websitePath: "blog" },
  CASE_STUDY: { path: "case-studies", label: "Case Study", plural: "Case Studies", websitePath: "case-studies" },
};

export const STATUS_OPTIONS: { value: ContentPostStatus; label: string; badge: BadgeProps["variant"] }[] = [
  { value: "DRAFT", label: "Draft", badge: "muted" },
  { value: "PUBLISHED", label: "Published", badge: "success" },
  { value: "ARCHIVED", label: "Archived", badge: "destructive" },
];

// List status tabs
export type ContentStatusTab = "" | "DRAFT" | "PUBLISHED" | "UNPUBLISHED" | "ARCHIVED";

export const STATUS_TABS: { value: ContentStatusTab; label: string; count: keyof ContentPostCounts }[] = [
  { value: "", label: "All", count: "all" },
  { value: "DRAFT", label: "Drafts", count: "draft" },
  { value: "PUBLISHED", label: "Published", count: "published" },
  { value: "UNPUBLISHED", label: "Unpublished changes", count: "unpublishedChanges" },
  { value: "ARCHIVED", label: "Archived", count: "archived" },
];

export const SORT_OPTIONS: { value: ContentPostSort; label: string }[] = [
  { value: "updated_desc", label: "Last updated" },
  { value: "published_desc", label: "Newest published" },
  { value: "published_asc", label: "Oldest published" },
  { value: "title_asc", label: "Title A–Z" },
  { value: "title_desc", label: "Title Z–A" },
];

export function statusLabel(status: ContentPostStatus) {
  return STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
}

export function statusBadgeVariant(status: ContentPostStatus): BadgeProps["variant"] {
  return STATUS_OPTIONS.find((s) => s.value === status)?.badge ?? "default";
}

// Live post URL
export function liveUrl(type: ContentPostType, siteUrl: string | null | undefined, slug: string): string | null {
  return siteUrl ? `${siteUrl}/${TYPE_CONFIG[type].websitePath}/${slug}` : null;
}

// Title to slug
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, LIMITS.slug)
    .replace(/-+$/, "");
}

// 400 field errors
export function fieldErrorsFrom(err: unknown): Record<string, string> | null {
  const data = (err as { response?: { status?: number; data?: { code?: string; errors?: ContentFieldError[] } } })
    ?.response;
  if (data?.status !== 400 || data.data?.code !== "VALIDATION_FAILED" || !Array.isArray(data.data.errors)) {
    return null;
  }
  const map: Record<string, string> = {};
  for (const e of data.data.errors) {
    if (!map[e.field]) map[e.field] = e.message;
  }
  return map;
}

// Backend error code
export function errorCodeOf(err: unknown): string | undefined {
  return (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
}

// Nested errors
export function errorsUnder(errors: Record<string, string>, path: string): string[] {
  return Object.entries(errors)
    .filter(([field]) => field === path || field.startsWith(`${path}.`))
    .map(([, message]) => message);
}

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

// "5 minutes ago"
export function timeAgo(value?: string | null) {
  if (!value) return "—";
  const seconds = (Date.parse(value) - Date.now()) / 1000;
  const abs = Math.abs(seconds);
  if (abs < 45) return "just now";
  if (abs < 3600) return relative.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), "hour");
  if (abs < 7 * 86400) return relative.format(Math.round(seconds / 86400), "day");
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
