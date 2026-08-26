import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { STATUS_OPTIONS } from "./complaintOptions";
import type { ComplaintStatus } from "@/types";

export interface ComplaintFilters {
  search: string;
  status: ComplaintStatus | "";
}

interface ComplaintFiltersBarProps {
  filters: ComplaintFilters;
  onChange: (filters: ComplaintFilters) => void;
}

export const emptyComplaintFilters: ComplaintFilters = {
  search: "",
  status: "",
};

export default function ComplaintFiltersBar({ filters, onChange }: ComplaintFiltersBarProps) {
  const hasActiveFilters = !!filters.status;

  function update<K extends keyof ComplaintFilters>(key: K, value: ComplaintFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="space-y-3">
      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by complaint no., subject, sales order, or customer"
          className="pl-9"
          value={filters.search}
          onChange={(e) => update("search", e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          className="w-40"
          value={filters.status}
          onChange={(e) => update("status", e.target.value as ComplaintStatus | "")}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({ ...emptyComplaintFilters, search: filters.search })}
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
