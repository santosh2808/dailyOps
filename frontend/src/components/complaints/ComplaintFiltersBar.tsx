import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { STATUS_OPTIONS, SOURCE_OPTIONS, WARRANTY_VERIFICATION_OPTIONS } from "./complaintOptions";
import { getComplaintFilterOptions, type ComplaintFilterOptions } from "@/api/complaints";
import type { ComplaintSource, ComplaintStatus, WarrantyVerificationStatus } from "@/types";

export interface ComplaintFilters {
  search: string;
  status: ComplaintStatus | "";
  // Bug fix (TC-057): "Essential filters missing in the complaints list" —
  // brings this filter bar up to parity with LeadFiltersBar's shape
  // (assignedTo/source/date range), plus a few Complaint-specific ones.
  assignedToUserId: string;
  departmentId: string;
  source: ComplaintSource | "";
  sourceWebsiteId: string;
  sourceSubjectCode: string;
  warrantyVerificationStatus: WarrantyVerificationStatus | "";
  dateFrom: string;
  dateTo: string;
}

interface ComplaintFiltersBarProps {
  filters: ComplaintFilters;
  onChange: (filters: ComplaintFilters) => void;
}

export const emptyComplaintFilters: ComplaintFilters = {
  search: "",
  status: "",
  assignedToUserId: "",
  departmentId: "",
  source: "",
  sourceWebsiteId: "",
  sourceSubjectCode: "",
  warrantyVerificationStatus: "",
  dateFrom: "",
  dateTo: "",
};

const emptyOptions: ComplaintFilterOptions = {
  departments: [],
  users: [],
  websites: [],
  categories: [],
  sources: [],
  warrantyVerificationStatuses: [],
};

export default function ComplaintFiltersBar({ filters, onChange }: ComplaintFiltersBarProps) {
  // Bug fix (TC-057): populated from a Complaint-permission-scoped endpoint
  // (see ComplaintsService.getFilterOptions()) rather than
  // listDepartments()/listAssignableUsers()/listFormWebsites(), since those
  // are gated by Department:View/Lead:View/FormConfiguration:View — none of
  // which a Complaint viewer is guaranteed to hold.
  const [options, setOptions] = useState<ComplaintFilterOptions>(emptyOptions);

  useEffect(() => {
    getComplaintFilterOptions()
      .then(setOptions)
      .catch(() => setOptions(emptyOptions));
  }, []);

  const hasActiveFilters =
    !!filters.status ||
    !!filters.assignedToUserId ||
    !!filters.departmentId ||
    !!filters.source ||
    !!filters.sourceWebsiteId ||
    !!filters.sourceSubjectCode ||
    !!filters.warrantyVerificationStatus ||
    !!filters.dateFrom ||
    !!filters.dateTo;

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

        <Select
          className="w-44"
          value={filters.assignedToUserId}
          onChange={(e) => update("assignedToUserId", e.target.value)}
        >
          <option value="">All assignees</option>
          <option value="unassigned">Unassigned</option>
          {options.users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>

        <Select
          className="w-40"
          value={filters.departmentId}
          onChange={(e) => update("departmentId", e.target.value)}
        >
          <option value="">All departments</option>
          {options.departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>

        <Select
          className="w-36"
          value={filters.source}
          onChange={(e) => update("source", e.target.value as ComplaintSource | "")}
        >
          <option value="">All sources</option>
          {SOURCE_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>

        <Select
          className="w-40"
          value={filters.sourceWebsiteId}
          onChange={(e) => update("sourceWebsiteId", e.target.value)}
        >
          <option value="">All websites</option>
          {options.websites.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>

        <Select
          className="w-40"
          value={filters.sourceSubjectCode}
          onChange={(e) => update("sourceSubjectCode", e.target.value)}
        >
          <option value="">All categories</option>
          {options.categories.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </Select>

        <Select
          className="w-44"
          value={filters.warrantyVerificationStatus}
          onChange={(e) => update("warrantyVerificationStatus", e.target.value as WarrantyVerificationStatus | "")}
        >
          <option value="">All warranty statuses</option>
          {WARRANTY_VERIFICATION_OPTIONS.map((w) => (
            <option key={w.value} value={w.value}>
              {w.label}
            </option>
          ))}
        </Select>

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
