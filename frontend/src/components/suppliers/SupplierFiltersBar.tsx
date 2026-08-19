import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { STATUS_OPTIONS } from "./supplierOptions";
import type { SupplierStatus } from "@/types";

export interface SupplierFilters {
  search: string;
  status: SupplierStatus | "";
  country: string;
}

interface SupplierFiltersBarProps {
  filters: SupplierFilters;
  onChange: (filters: SupplierFilters) => void;
}

export const emptySupplierFilters: SupplierFilters = {
  search: "",
  status: "",
  country: "",
};

export default function SupplierFiltersBar({ filters, onChange }: SupplierFiltersBarProps) {
  const hasActiveFilters = !!filters.status || !!filters.country;

  function update<K extends keyof SupplierFilters>(key: K, value: SupplierFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="space-y-3">
      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by code, name, contact, phone, email, or GST number"
          className="pl-9"
          value={filters.search}
          onChange={(e) => update("search", e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          className="w-40"
          value={filters.status}
          onChange={(e) => update("status", e.target.value as SupplierStatus | "")}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>

        <Input
          className="w-40"
          placeholder="Country"
          value={filters.country}
          onChange={(e) => update("country", e.target.value)}
        />

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({ ...emptySupplierFilters, search: filters.search })}
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
