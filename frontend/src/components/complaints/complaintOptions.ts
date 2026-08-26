import type { BadgeProps } from "@/components/ui/badge";
import type { ComplaintStatus } from "@/types";

// Central place for Complaint enum -> label/color mappings, so ComplaintList,
// ComplaintForm, and ComplaintDetails all render status the same way instead
// of duplicating switch statements — same convention as supplierOptions.ts.

export const STATUS_OPTIONS: { value: ComplaintStatus; label: string; badge: BadgeProps["variant"] }[] = [
  { value: "OPEN", label: "Open", badge: "warning" },
  { value: "IN_PROGRESS", label: "In Progress", badge: "info" },
  { value: "RESOLVED", label: "Resolved", badge: "success" },
  { value: "CLOSED", label: "Closed", badge: "muted" },
];

export function statusLabel(status: ComplaintStatus) {
  return STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
}

export function statusBadgeVariant(status: ComplaintStatus): BadgeProps["variant"] {
  return STATUS_OPTIONS.find((s) => s.value === status)?.badge ?? "default";
}
