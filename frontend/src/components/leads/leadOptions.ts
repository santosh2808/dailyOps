import type { BadgeProps } from "@/components/ui/badge";
import type { LeadPriority, LeadSource, LeadStatus } from "@/types";

// Central place for Lead enum -> label/color mappings, so LeadList,
// LeadForm, and LeadDetails all render statuses/priorities/sources the same
// way instead of duplicating switch statements.

export const STATUS_OPTIONS: { value: LeadStatus; label: string; badge: BadgeProps["variant"] }[] = [
  { value: "NEW", label: "New", badge: "default" },
  { value: "CONTACTED", label: "Contacted", badge: "info" },
  { value: "QUALIFIED", label: "Qualified", badge: "info" },
  { value: "SITE_VISIT", label: "Site Visit", badge: "warning" },
  { value: "QUOTATION_SENT", label: "Quotation Sent", badge: "warning" },
  { value: "NEGOTIATION", label: "Negotiation", badge: "warning" },
  { value: "WON", label: "Won", badge: "success" },
  { value: "LOST", label: "Lost", badge: "muted" },
  { value: "NOT_INTERESTED", label: "Not Interested", badge: "muted" },
];

export const PRIORITY_OPTIONS: { value: LeadPriority; label: string; badge: BadgeProps["variant"] }[] = [
  { value: "LOW", label: "Low", badge: "muted" },
  { value: "MEDIUM", label: "Medium", badge: "default" },
  { value: "HIGH", label: "High", badge: "warning" },
  { value: "URGENT", label: "Urgent", badge: "destructive" },
];

export const SOURCE_OPTIONS: { value: LeadSource; label: string }[] = [
  { value: "WEBSITE", label: "Website" },
  { value: "LINKEDIN", label: "LinkedIn" },
  { value: "REFERENCE", label: "Reference" },
  { value: "TRADE_SHOW", label: "Trade Show" },
  { value: "COLD_CALL", label: "Cold Call" },
  { value: "DISTRIBUTOR", label: "Distributor" },
  { value: "WALK_IN", label: "Walk In" },
  { value: "EMAIL", label: "Email" },
  { value: "PHONE", label: "Phone" },
  { value: "OTHER", label: "Other" },
];

export function statusLabel(status: LeadStatus) {
  return STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
}

export function statusBadgeVariant(status: LeadStatus): BadgeProps["variant"] {
  return STATUS_OPTIONS.find((s) => s.value === status)?.badge ?? "default";
}

export function priorityLabel(priority: LeadPriority) {
  return PRIORITY_OPTIONS.find((p) => p.value === priority)?.label ?? priority;
}

export function priorityBadgeVariant(priority: LeadPriority): BadgeProps["variant"] {
  return PRIORITY_OPTIONS.find((p) => p.value === priority)?.badge ?? "default";
}

export function sourceLabel(source: LeadSource) {
  return SOURCE_OPTIONS.find((s) => s.value === source)?.label ?? source;
}
