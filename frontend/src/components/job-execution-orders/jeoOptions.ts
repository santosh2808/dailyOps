import type { BadgeProps } from "@/components/ui/badge";
import type { JeoPriority, JeoStatus } from "@/types";

// Central place for JEO status/priority -> label/color mapping, mirroring
// leadOptions.ts / quotationOptions.ts / salesOrderOptions.ts / proformaInvoiceOptions.ts.

export const STATUS_OPTIONS: { value: JeoStatus; label: string; badge: BadgeProps["variant"] }[] = [
  { value: "PENDING", label: "Pending", badge: "muted" },
  { value: "MATERIAL_READY", label: "Material Ready", badge: "info" },
  { value: "ASSEMBLY_STARTED", label: "Assembly Started", badge: "info" },
  { value: "QC", label: "QC", badge: "warning" },
  { value: "READY_FOR_DISPATCH", label: "Ready For Dispatch", badge: "success" },
  { value: "COMPLETED", label: "Completed", badge: "success" },
];

export function statusLabel(status: JeoStatus) {
  return STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
}

export function statusBadgeVariant(status: JeoStatus): BadgeProps["variant"] {
  return STATUS_OPTIONS.find((s) => s.value === status)?.badge ?? "default";
}

export const PRIORITY_OPTIONS: { value: JeoPriority; label: string; badge: BadgeProps["variant"] }[] = [
  { value: "LOW", label: "Low", badge: "muted" },
  { value: "MEDIUM", label: "Medium", badge: "info" },
  { value: "HIGH", label: "High", badge: "warning" },
  { value: "URGENT", label: "Urgent", badge: "destructive" },
];

export function priorityLabel(priority: JeoPriority) {
  return PRIORITY_OPTIONS.find((p) => p.value === priority)?.label ?? priority;
}

export function priorityBadgeVariant(priority: JeoPriority): BadgeProps["variant"] {
  return PRIORITY_OPTIONS.find((p) => p.value === priority)?.badge ?? "default";
}
