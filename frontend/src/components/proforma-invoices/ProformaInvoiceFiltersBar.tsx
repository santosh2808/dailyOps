import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import FilterPanel from "@/components/shared/FilterPanel";
import { STATUS_OPTIONS } from "./proformaInvoiceOptions";
import type { ProformaInvoiceStatus } from "@/types";

export interface ProformaInvoiceFilters {
  search: string;
  status: ProformaInvoiceStatus | "";
  dateFrom: string;
  dateTo: string;
}

interface ProformaInvoiceFiltersBarProps {
  filters: ProformaInvoiceFilters;
  onChange: (filters: ProformaInvoiceFilters) => void;
}

export const emptyProformaInvoiceFilters: ProformaInvoiceFilters = {
  search: "",
  status: "",
  dateFrom: "",
  dateTo: "",
};

export default function ProformaInvoiceFiltersBar({ filters, onChange }: ProformaInvoiceFiltersBarProps) {
  // A from/to date pair counts as one filter.
  const activeFilterCount = [
    filters.status,
    filters.dateFrom || filters.dateTo,
  ].filter(Boolean).length;

  function update<K extends keyof ProformaInvoiceFilters>(key: K, value: ProformaInvoiceFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="space-y-3">
      <div className="relative w-full md:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by invoice #, JEO #, order #, company, or contact"
          className="pl-9"
          value={filters.search}
          onChange={(e) => update("search", e.target.value)}
        />
      </div>

      <FilterPanel
        activeCount={activeFilterCount}
        onClear={() => onChange({ ...emptyProformaInvoiceFilters, search: filters.search })}
      >
        <Select
          className="w-40"
          value={filters.status}
          onChange={(e) => update("status", e.target.value as ProformaInvoiceStatus | "")}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>

        <Input
          type="date"
          className="w-40"
          value={filters.dateFrom}
          onChange={(e) => update("dateFrom", e.target.value)}
          aria-label="Invoice date from"
        />
        <Input
          type="date"
          className="w-40"
          value={filters.dateTo}
          onChange={(e) => update("dateTo", e.target.value)}
          aria-label="Invoice date to"
        />
      </FilterPanel>
    </div>
  );
}
