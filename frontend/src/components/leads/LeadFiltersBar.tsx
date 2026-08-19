import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { STATUS_OPTIONS, PRIORITY_OPTIONS, SOURCE_OPTIONS } from "./leadOptions";
import type { LeadPriority, LeadSource, LeadStatus } from "@/types";

export interface LeadFilters {
  search: string;
  status: LeadStatus | "";
  priority: LeadPriority | "";
  source: LeadSource | "";
  assignedTo: string;
  dateFrom: string;
  dateTo: string;
}

interface LeadFiltersBarProps {
  filters: LeadFilters;
  onChange: (filters: LeadFilters) => void;
}

export const emptyLeadFilters: LeadFilters = {
  search: "",
  status: "",
  priority: "",
  source: "",
  assignedTo: "",
  dateFrom: "",
  dateTo: "",
};

export default function LeadFiltersBar({ filters, onChange }: LeadFiltersBarProps) {
  const hasActiveFilters =
    !!filters.status ||
    !!filters.priority ||
    !!filters.source ||
    !!filters.assignedTo ||
    !!filters.dateFrom ||
    !!filters.dateTo;

  function update<K extends keyof LeadFilters>(key: K, value: LeadFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="space-y-3">
      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by lead #, company, contact, email, phone, or title"
          className="pl-9"
          value={filters.search}
          onChange={(e) => update("search", e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          className="w-40"
          value={filters.status}
          onChange={(e) => update("status", e.target.value as LeadStatus | "")}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>

        <Select
          className="w-36"
          value={filters.priority}
          onChange={(e) => update("priority", e.target.value as LeadPriority | "")}
        >
          <option value="">All priorities</option>
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>

        <Select
          className="w-40"
          value={filters.source}
          onChange={(e) => update("source", e.target.value as LeadSource | "")}
        >
          <option value="">All sources</option>
          {SOURCE_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>

        <Input
          className="w-40"
          placeholder="Assigned to"
          value={filters.assignedTo}
          onChange={(e) => update("assignedTo", e.target.value)}
        />

        <Input
          type="date"
          className="w-40"
          value={filters.dateFrom}
          onChange={(e) => update("dateFrom", e.target.value)}
          aria-label="Created from"
        />
        <Input
          type="date"
          className="w-40"
          value={filters.dateTo}
          onChange={(e) => update("dateTo", e.target.value)}
          aria-label="Created to"
        />

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={() => onChange({ ...emptyLeadFilters, search: filters.search })}>
            <X className="mr-1 h-3.5 w-3.5" />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
