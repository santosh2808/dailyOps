import type { BadgeProps } from "@/components/ui/badge";
import type { TaxInvoiceStatus } from "@/types";

// Central place for Tax Invoice status -> label/color mapping, mirroring
// proformaInvoiceOptions.ts.

export const STATUS_OPTIONS: { value: TaxInvoiceStatus; label: string; badge: BadgeProps["variant"] }[] = [
  { value: "DRAFT", label: "Draft", badge: "muted" },
  { value: "SENT", label: "Sent", badge: "info" },
  { value: "CANCELLED", label: "Cancelled", badge: "destructive" },
];

export function statusLabel(status: TaxInvoiceStatus) {
  return STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
}

export function statusBadgeVariant(status: TaxInvoiceStatus): BadgeProps["variant"] {
  return STATUS_OPTIONS.find((s) => s.value === status)?.badge ?? "default";
}
