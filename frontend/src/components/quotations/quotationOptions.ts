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
// here is what fixes that.
//
// Only Aluminium and Orange are the free, standard colors (see
// FREE_PAINT_COLORS below) — Black/White/Grey are still offered as quick
// picks since staff ask for them often, but they (and anything typed under
// Custom) carry the same extra charge as a one-off custom color. Mirrors
// STANDARD_PAINT_EXTRA_CHARGE below and EXCLUSIONS in
// quotation-pdf.service.ts ("Any specific paint shall be charged extra @
// Rs.10,000.00").
export const PAINT_COLOR_OPTIONS = [
  { value: "Aluminium", label: "Aluminium" },
  { value: "Orange", label: "Orange" },
  { value: "Black", label: "Black (extra cost)" },
  { value: "White", label: "White (extra cost)" },
  { value: "Grey", label: "Grey (extra cost)" },
  { value: "CUSTOM", label: "Custom / Other (extra cost)" },
] as const;

// The only two colors that don't carry the extra paint charge.
export const FREE_PAINT_COLORS = new Set<string>(["Aluminium", "Orange"]);

// Mirrors the "Any specific paint shall be charged extra @ Rs.10,000.00"
// line in quotation-pdf.service.ts's EXCLUSIONS list — used to suggest a
// starting Color Charge the moment staff pick any color other than
// Aluminium/Orange, since that always carries this extra cost.
export const STANDARD_PAINT_EXTRA_CHARGE = 10000;

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
