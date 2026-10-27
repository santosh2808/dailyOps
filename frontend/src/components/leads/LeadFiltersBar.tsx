import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import DateRangePicker from "@/components/shared/DateRangePicker";
import FilterPanel from "@/components/shared/FilterPanel";
import { STATUS_OPTIONS, PRIORITY_OPTIONS, SOURCE_OPTIONS } from "./leadOptions";
import { listAssignableUsers } from "@/api/users";
import { INDIA_STATES } from "@/lib/indiaStates";
import type { AssignableUser, LeadPriority, LeadSource, LeadStatus } from "@/types";

export interface LeadFilters {
  search: string;
  status: LeadStatus | "";
  priority: LeadPriority | "";
  source: LeadSource | "";
  assignedToUserId: string;
  state: string;
  dateFrom: string;
  dateTo: string;
  // Set by the Dashboard's follow-up notification link; "" = no filter.
  followUp?: "" | "TODAY" | "OVERDUE" | "UPCOMING";
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
  state: "",
  dateFrom: "",
  dateTo: "",
  followUp: "",
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

  // The created-date range counts as one filter.
  const activeFilterCount = [
    filters.status,
    filters.priority,
    filters.source,
    filters.assignedToUserId,
    filters.state,
    filters.dateFrom || filters.dateTo,
    filters.followUp,
  ].filter(Boolean).length;

  function update<K extends keyof LeadFilters>(key: K, value: LeadFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="space-y-3">
      <div className="relative w-full md:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by lead #, company, contact, email, phone, or title"
          className="pl-9"
          value={filters.search}
          onChange={(e) => update("search", e.target.value)}
        />
      </div>

      <FilterPanel
        activeCount={activeFilterCount}
        onClear={() => onChange({ ...emptyLeadFilters, search: filters.search })}
      >
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

        <Select
          className="w-44"
          value={filters.state}
          onChange={(e) => update("state", e.target.value)}
        >
          <option value="">All states</option>
          {INDIA_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>

        <Select
          className="w-44"
          value={filters.followUp ?? ""}
          onChange={(e) => update("followUp", e.target.value as LeadFilters["followUp"])}
        >
          <option value="">All follow-ups</option>
          <option value="TODAY">Follow-up today</option>
          <option value="OVERDUE">Follow-up overdue</option>
          <option value="UPCOMING">Follow-up next 7 days</option>
        </Select>

        <DateRangePicker
          from={filters.dateFrom}
          to={filters.dateTo}
          onChange={({ from, to }) => onChange({ ...filters, dateFrom: from, dateTo: to })}
          placeholder="Created date range"
        />
      </FilterPanel>
    </div>
  );
}
