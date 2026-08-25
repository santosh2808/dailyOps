import type { BadgeProps } from "@/components/ui/badge";
import type { Lead, LeadPriority, LeadSource, LeadStatus } from "@/types";

// Central place for Lead enum -> label/color mappings, so LeadList,
// LeadForm, and LeadDetails all render statuses/priorities/sources the same
// way instead of duplicating switch statements.

// Lead Management Phase 1 — full replacement matching the exact required
// stage order (requirement #1): New -> Assigned -> Contacted -> Site Visit
// -> Qualified -> Quotation Sent -> Won/Lost.
export const STATUS_OPTIONS: { value: LeadStatus; label: string; badge: BadgeProps["variant"] }[] = [
  { value: "NEW", label: "New", badge: "default" },
  { value: "ASSIGNED", label: "Assigned", badge: "info" },
  { value: "CONTACTED", label: "Contacted", badge: "info" },
  { value: "SITE_VISIT", label: "Site Visit", badge: "warning" },
  { value: "QUALIFIED", label: "Qualified", badge: "warning" },
  { value: "QUOTATION_SENT", label: "Quotation Sent", badge: "warning" },
  { value: "WON", label: "Won", badge: "success" },
  { value: "LOST", label: "Lost", badge: "muted" },
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

// Lead Management Phase 1 (requirement #12) — "On every stage, show the
// next available action... users should never wonder what to do next."
// One function, driven off the lead's own status (and, for QUALIFIED,
// whether a Quotation has already been generated) so Lead List and Lead
// Details render exactly the same guidance.
export interface NextAction {
  label: string;
  hint: string;
}

export function nextActionFor(lead: Lead): NextAction {
  switch (lead.status) {
    case "NEW":
      return { label: "Assign Sales Person", hint: "Pick who owns this lead to move it forward." };
    case "ASSIGNED":
      return { label: "Contact Customer", hint: "Reach out, then update the status to Contacted." };
    case "CONTACTED":
      return {
        label: "Schedule Follow-up",
        hint: "Set a Next Follow-up date, then move to Site Visit once one is scheduled.",
      };
    case "SITE_VISIT":
      return {
        label: "Complete Site Visit",
        hint: "Once the site visit is done, mark this lead as Qualified.",
      };
    case "QUALIFIED": {
      const latest = lead.quotations?.[0];
      if (!latest) {
        return {
          label: "Generate Quotation",
          hint: "This lead is Qualified — generate a quotation from its linked products.",
        };
      }
      if (latest.status === "DRAFT" || latest.status === "READY") {
        return {
          label: "Send Quotation",
          hint: `Quotation ${latest.quotationNumber} is ready — review it and send it to the customer.`,
        };
      }
      return {
        label: "View Quotation",
        hint: `Quotation ${latest.quotationNumber} has already been generated for this lead.`,
      };
    }
    case "QUOTATION_SENT":
      return {
        label: "Waiting for Customer Response",
        hint: "Customer Acceptance and Sales Order creation are part of Phase 2.",
      };
    case "WON":
      return lead.isConverted
        ? { label: "Deal Won", hint: "This lead has been converted to a Customer." }
        : { label: "Convert to Customer", hint: "Convert this Won lead into a Customer record." };
    case "LOST":
      return { label: "Lead Lost", hint: "No further action is needed on this lead." };
    default:
      return { label: "", hint: "" };
  }
}
