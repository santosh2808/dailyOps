import type { BadgeProps } from "@/components/ui/badge";
import type { SupplierStatus } from "@/types";

// Central place for Supplier enum -> label/color mappings, so SupplierList,
// SupplierForm, and SupplierDetails all render status the same way instead
// of duplicating switch statements — same convention as leadOptions.ts.

export const STATUS_OPTIONS: { value: SupplierStatus; label: string; badge: BadgeProps["variant"] }[] = [
  { value: "ACTIVE", label: "Active", badge: "success" },
  { value: "INACTIVE", label: "Inactive", badge: "muted" },
];

export function statusLabel(status: SupplierStatus) {
  return STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
}

export function statusBadgeVariant(status: SupplierStatus): BadgeProps["variant"] {
  return STATUS_OPTIONS.find((s) => s.value === status)?.badge ?? "default";
}
