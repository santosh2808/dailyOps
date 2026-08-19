import type { BadgeProps } from "@/components/ui/badge";
import type { SalesOrderStatus } from "@/types";

// Central place for Sales Order status -> label/color mapping, mirroring
// leadOptions.ts / quotationOptions.ts so all three modules render status
// consistently instead of duplicating switch statements.

export const STATUS_OPTIONS: { value: SalesOrderStatus; label: string; badge: BadgeProps["variant"] }[] = [
  { value: "DRAFT", label: "Draft", badge: "muted" },
  { value: "CONFIRMED", label: "Confirmed", badge: "info" },
  { value: "PRODUCTION_STARTED", label: "Production Started", badge: "warning" },
  { value: "READY_FOR_DISPATCH", label: "Ready for Dispatch", badge: "warning" },
  { value: "DISPATCHED", label: "Dispatched", badge: "info" },
  { value: "COMPLETED", label: "Completed", badge: "success" },
  { value: "CANCELLED", label: "Cancelled", badge: "destructive" },
];

export function statusLabel(status: SalesOrderStatus) {
  return STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
}

export function statusBadgeVariant(status: SalesOrderStatus): BadgeProps["variant"] {
  return STATUS_OPTIONS.find((s) => s.value === status)?.badge ?? "default";
}
