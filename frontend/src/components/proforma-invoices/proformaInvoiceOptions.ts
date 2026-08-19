import type { BadgeProps } from "@/components/ui/badge";
import type { ProformaInvoiceStatus } from "@/types";

// Central place for Proforma Invoice status -> label/color mapping,
// mirroring leadOptions.ts / quotationOptions.ts / salesOrderOptions.ts.

export const STATUS_OPTIONS: { value: ProformaInvoiceStatus; label: string; badge: BadgeProps["variant"] }[] = [
  { value: "DRAFT", label: "Draft", badge: "muted" },
  { value: "SENT", label: "Sent", badge: "info" },
  { value: "EXPIRED", label: "Expired", badge: "warning" },
  { value: "CANCELLED", label: "Cancelled", badge: "destructive" },
];

export function statusLabel(status: ProformaInvoiceStatus) {
  return STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
}

export function statusBadgeVariant(status: ProformaInvoiceStatus): BadgeProps["variant"] {
  return STATUS_OPTIONS.find((s) => s.value === status)?.badge ?? "default";
}
