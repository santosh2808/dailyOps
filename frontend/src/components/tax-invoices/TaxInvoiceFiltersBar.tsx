import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { STATUS_OPTIONS } from "./taxInvoiceOptions";
import type { TaxInvoiceStatus } from "@/types";

export interface TaxInvoiceFilters {
  search: string;
  status: TaxInvoiceStatus | "";
  dateFrom: string;
  dateTo: string;
}

interface TaxInvoiceFiltersBarProps {
  filters: TaxInvoiceFilters;
  onChange: (filters: TaxInvoiceFilters) => void;
}

export const emptyTaxInvoiceFilters: TaxInvoiceFilters = {
  search: "",
  status: "",
  dateFrom: "",
  dateTo: "",
};

export default function TaxInvoiceFiltersBar({ filters, onChange }: TaxInvoiceFiltersBarProps) {
  const hasActiveFilters = !!filters.status || !!filters.dateFrom || !!filters.dateTo;

  function update<K extends keyof TaxInvoiceFilters>(key: K, value: TaxInvoiceFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="space-y-3">
      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by invoice #, order #, company, or contact"
          className="pl-9"
          value={filters.search}
          onChange={(e) => update("search", e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          className="w-40"
          value={filters.status}
          onChange={(e) => update("status", e.target.value as TaxInvoiceStatus | "")}
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

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({ ...emptyTaxInvoiceFilters, search: filters.search })}
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
