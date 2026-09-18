import type { BadgeProps } from "@/components/ui/badge";
import type { ComplaintSource, ComplaintStatus, WarrantyVerificationStatus } from "@/types";

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

// Bug fix (TC-057): label mappings for the new Source / Warranty
// Verification Status filters — same convention as STATUS_OPTIONS above.
export const SOURCE_OPTIONS: { value: ComplaintSource; label: string }[] = [
  { value: "INTERNAL", label: "Internal" },
  { value: "WEB_FORM", label: "Web Form" },
  { value: "CONVERTED_FROM_LEAD", label: "Converted from Lead" },
];

export function complaintSourceLabel(source: ComplaintSource) {
  return SOURCE_OPTIONS.find((s) => s.value === source)?.label ?? source;
}

export const WARRANTY_VERIFICATION_OPTIONS: { value: WarrantyVerificationStatus; label: string }[] = [
  { value: "UNVERIFIED", label: "Unverified" },
  { value: "VERIFIED", label: "Verified" },
  { value: "NOT_FOUND", label: "Not Found" },
];

export function warrantyVerificationLabel(status: WarrantyVerificationStatus) {
  return WARRANTY_VERIFICATION_OPTIONS.find((s) => s.value === status)?.label ?? status;
}
