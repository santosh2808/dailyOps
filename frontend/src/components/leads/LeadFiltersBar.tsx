import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { STATUS_OPTIONS, PRIORITY_OPTIONS, SOURCE_OPTIONS } from "./leadOptions";
import { listAssignableUsers } from "@/api/users";
import type { AssignableUser, LeadPriority, LeadSource, LeadStatus } from "@/types";

export interface LeadFilters {
  search: string;
  status: LeadStatus | "";
  priority: LeadPriority | "";
  source: LeadSource | "";
  assignedToUserId: string;
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
  assignedToUserId: "",
  dateFrom: "",
  dateTo: "",
};

export default function LeadFiltersBar({ filters, onChange }: LeadFiltersBarProps) {
  // Lead Assignment enhancement: this filter used to be free text; it's now
  // a select over the same active Sales Executive/Sales Manager users the
  // Lead Assignment picker itself uses, since assignment is now a real user
  // reference rather than a name string to substring-match against.
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);

  useEffect(() => {
    listAssignableUsers()
      .then(setAssignableUsers)
      .catch(() => setAssignableUsers([]));
  }, []);

  const hasActiveFilters =
    !!filters.status ||
    !!filters.priority ||
    !!filters.source ||
    !!filters.assignedToUserId ||
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

        <Select
          className="w-44"
          value={filters.assignedToUserId}
          onChange={(e) => update("assignedToUserId", e.target.value)}
        >
          <option value="">All assignees</option>
          {assignableUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
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
          <Button variant="ghost" size="sm" onClick={() => onChange({ ...emptyLeadFilters, search: filters.search })}>
            <X className="mr-1 h-3.5 w-3.5" />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
