import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import FilterPanel from "@/components/shared/FilterPanel";
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from "./jeoOptions";
import type { JeoPriority, JeoStatus } from "@/types";

export interface JeoFilters {
  search: string;
  status: JeoStatus | "";
  priority: JeoPriority | "";
  dateFrom: string;
  dateTo: string;
}

interface JeoFiltersBarProps {
  filters: JeoFilters;
  onChange: (filters: JeoFilters) => void;
}

export const emptyJeoFilters: JeoFilters = {
  search: "",
  status: "",
  priority: "",
  dateFrom: "",
  dateTo: "",
};

export default function JeoFiltersBar({ filters, onChange }: JeoFiltersBarProps) {
  // A from/to date pair counts as one filter.
  const activeFilterCount = [
    filters.status,
    filters.priority,
    filters.dateFrom || filters.dateTo,
  ].filter(Boolean).length;

  function update<K extends keyof JeoFilters>(key: K, value: JeoFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="space-y-3">
      <div className="relative w-full md:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by JEO #, order #, company, or contact"
          className="pl-9"
          value={filters.search}
          onChange={(e) => update("search", e.target.value)}
        />
      </div>

      <FilterPanel
        activeCount={activeFilterCount}
        onClear={() => onChange({ ...emptyJeoFilters, search: filters.search })}
      >
        <Select
          className="w-40"
          value={filters.status}
          onChange={(e) => update("status", e.target.value as JeoStatus | "")}
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
          onChange={(e) => update("priority", e.target.value as JeoPriority | "")}
        >
          <option value="">All priorities</option>
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>

        <Input
          type="date"
          className="w-40"
          value={filters.dateFrom}
          onChange={(e) => update("dateFrom", e.target.value)}
          aria-label="Delivery date from"
        />
        <Input
          type="date"
          className="w-40"
          value={filters.dateTo}
          onChange={(e) => update("dateTo", e.target.value)}
          aria-label="Delivery date to"
        />
      </FilterPanel>
    </div>
  );
}
