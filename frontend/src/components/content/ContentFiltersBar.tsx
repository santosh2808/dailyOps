import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import FilterPanel from "@/components/shared/FilterPanel";
import type { ContentPostSort } from "@/api/content";
import { BLOG_CATEGORIES, CASE_STUDY_INDUSTRIES, SORT_OPTIONS, type ContentStatusTab } from "./contentOptions";
import type { ContentPostType, ContentWebsiteOption } from "@/types";

export interface ContentFilters {
  websiteId: string;
  tab: ContentStatusTab;
  search: string;
  // Category or industry
  topic: string;
  featured: "" | "true";
  sort: ContentPostSort;
}

interface ContentFiltersBarProps {
  type: ContentPostType;
  websites: ContentWebsiteOption[];
  filters: ContentFilters;
  onChange: (filters: ContentFilters) => void;
}

export const emptyContentFilters: ContentFilters = {
  websiteId: "",
  tab: "",
  search: "",
  topic: "",
  featured: "",
  sort: "updated_desc",
};

export default function ContentFiltersBar({ type, websites, filters, onChange }: ContentFiltersBarProps) {
  const activeFilterCount = [
    filters.topic,
    filters.featured,
  ].filter(Boolean).length;
  const topics = type === "BLOG" ? BLOG_CATEGORIES : CASE_STUDY_INDUSTRIES;

  function update<K extends keyof ContentFilters>(key: K, value: ContentFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          className="w-48"
          aria-label="Website"
          value={filters.websiteId}
          onChange={(e) => update("websiteId", e.target.value)}
        >
          <option value="">All websites</option>
          {websites.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
        <div className="relative w-full md:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by title or URL name"
            className="pl-9"
            value={filters.search}
            onChange={(e) => update("search", e.target.value)}
          />
        </div>
      </div>

      <FilterPanel
        activeCount={activeFilterCount}
        onClear={() => onChange({ ...filters, topic: "", featured: "" })}
      >
        <Select className="w-44" aria-label={type === "BLOG" ? "Category" : "Industry"} value={filters.topic} onChange={(e) => update("topic", e.target.value)}>
          <option value="">{type === "BLOG" ? "All categories" : "All industries"}</option>
          {topics.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>

        <Select
          className="w-36"
          aria-label="Featured"
          value={filters.featured}
          onChange={(e) => update("featured", e.target.value as ContentFilters["featured"])}
        >
          <option value="">All posts</option>
          <option value="true">Featured only</option>
        </Select>

        <Select
          className="w-44"
          aria-label="Sort by"
          value={filters.sort}
          onChange={(e) => update("sort", e.target.value as ContentPostSort)}
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              Sort: {s.label}
            </option>
          ))}
        </Select>
      </FilterPanel>
    </div>
  );
}
