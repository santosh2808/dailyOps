import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import FilterPanel from "@/components/shared/FilterPanel";
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
  const activeFilterCount = [
    filters.status,
    filters.country,
  ].filter(Boolean).length;

  function update<K extends keyof SupplierFilters>(key: K, value: SupplierFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="space-y-3">
      <div className="relative w-full md:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by code, name, contact, phone, email, or GST number"
          className="pl-9"
          value={filters.search}
          onChange={(e) => update("search", e.target.value)}
        />
      </div>

      <FilterPanel
        activeCount={activeFilterCount}
        onClear={() => onChange({ ...emptySupplierFilters, search: filters.search })}
      >
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
      </FilterPanel>
    </div>
  );
}
