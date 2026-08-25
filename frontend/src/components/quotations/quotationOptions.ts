import type { BadgeProps } from "@/components/ui/badge";
import type { QuotationStatus } from "@/types";

// Central place for Quotation status -> label/color mapping, so
// QuotationList, QuotationForm, and QuotationDetails all render status the
// same way instead of duplicating switch statements (mirrors leadOptions.ts).

export const STATUS_OPTIONS: { value: QuotationStatus; label: string; badge: BadgeProps["variant"] }[] = [
  { value: "DRAFT", label: "Draft", badge: "muted" },
  { value: "READY", label: "Ready", badge: "warning" },
  { value: "SENT", label: "Sent", badge: "info" },
  { value: "ACCEPTED", label: "Accepted", badge: "success" },
  { value: "REJECTED", label: "Rejected", badge: "destructive" },
  { value: "EXPIRED", label: "Expired", badge: "warning" },
];

export function statusLabel(status: QuotationStatus) {
  return STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
}

export function statusBadgeVariant(status: QuotationStatus): BadgeProps["variant"] {
  return STATUS_OPTIONS.find((s) => s.value === status)?.badge ?? "default";
}
