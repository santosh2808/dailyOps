import type { BadgeProps } from "@/components/ui/badge";
import type { QuotationStatus } from "@/types";

// Central place for Quotation status -> label/color mapping, so
// QuotationList, QuotationForm, and QuotationDetails all render status the
// same way instead of duplicating switch statements (mirrors leadOptions.ts).

export const STATUS_OPTIONS: { value: QuotationStatus; label: string; badge: BadgeProps["variant"] }[] = [
  { value: "DRAFT", label: "Draft", badge: "muted" },
  { value: "READY", label: "Ready", badge: "warning" },
  { value: "SENT", label: "Sent", badge: "info" },
  // Customer Quotation Acceptance workflow — set only when the customer
  // opens the public /quote/:token link (see PublicQuotation.tsx).
  { value: "VIEWED", label: "Viewed by Customer", badge: "orange" },
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

// Standard paint color choices for a Quotation item's Color field —
// mirrors jeoOptions.ts's HANGING_STRUCTURE_OPTIONS pattern. Deliberately a
// fixed list plus "Custom" rather than free text by default: the PDF used
// to silently fall back to whatever color the seeded product catalog
// defaulted to (e.g. "BLACK COLOUR") whenever nothing was entered, which
// nobody had actually confirmed with the customer. Forcing a real choice
// here — Black included, but never assumed — is what fixes that.
export const PAINT_COLOR_OPTIONS = [
  { value: "Black", label: "Black" },
  { value: "White", label: "White" },
  { value: "Grey", label: "Grey" },
  { value: "Silver", label: "Silver" },
  { value: "CUSTOM", label: "Custom (specify below)" },
] as const;

const FIXED_COLOR_VALUES = new Set<string>(
  PAINT_COLOR_OPTIONS.filter((o) => o.value !== "CUSTOM").map((o) => o.value),
);

// Given whatever free-text value is actually stored on the item (color is
// still just a string on the wire — see QuotationItem.color), figures out
// which dropdown option should show as selected: a fixed color matches
// directly, any other non-empty value means "Custom" was used, and nothing
// set means no selection yet.
export function colorSelectValue(color?: string | null): string {
  if (!color || !color.trim()) return "";
  return FIXED_COLOR_VALUES.has(color) ? color : "CUSTOM";
}
