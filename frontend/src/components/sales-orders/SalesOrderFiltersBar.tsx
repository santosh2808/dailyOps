import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { STATUS_OPTIONS } from "./salesOrderOptions";
import type { SalesOrderStatus } from "@/types";

export interface SalesOrderFilters {
  search: string;
  status: SalesOrderStatus | "";
  dateFrom: string;
  dateTo: string;
  // Additive: Dashboard Redesign v2 — set only via a Dashboard link (India
  // Sales Map / Sales Executive Performance / Top Products), no dedicated
  // dropdown here yet; "Clear filters" below still resets them.
  customerState: string;
  createdBy: string;
  // Additive: Dashboard Redesign v2 — Top Products widget link.
  productId: string;
}

interface SalesOrderFiltersBarProps {
  filters: SalesOrderFilters;
  onChange: (filters: SalesOrderFilters) => void;
}

export const emptySalesOrderFilters: SalesOrderFilters = {
  search: "",
  status: "",
  dateFrom: "",
  dateTo: "",
  customerState: "",
  createdBy: "",
  productId: "",
};

export default function SalesOrderFiltersBar({ filters, onChange }: SalesOrderFiltersBarProps) {
  const hasActiveFilters =
    !!filters.status ||
    !!filters.dateFrom ||
    !!filters.dateTo ||
    !!filters.customerState ||
    !!filters.createdBy ||
    !!filters.productId;

  function update<K extends keyof SalesOrderFilters>(key: K, value: SalesOrderFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="space-y-3">
      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by order #, quotation #, company, or contact"
          className="pl-9"
          value={filters.search}
          onChange={(e) => update("search", e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          className="w-48"
          value={filters.status}
          onChange={(e) => update("status", e.target.value as SalesOrderStatus | "")}
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
          aria-label="Order date from"
        />
        <Input
          type="date"
          className="w-40"
          value={filters.dateTo}
          onChange={(e) => update("dateTo", e.target.value)}
          aria-label="Order date to"
        />

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({ ...emptySalesOrderFilters, search: filters.search })}
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
