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
  { value: "META", label: "Meta" },
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
      // Assigning a lead now auto-advances status to ASSIGNED (see
      // LeadsService's shouldAutoAdvanceToAssigned), so a lead only reaches
      // this branch with an assignee already set for data created before
      // that change shipped, or a web-form lead whose intake route has an
      // assignedUserId configured on it directly (createFromWebFormIntake
      // sets status the same way, so this is likewise now rare) — kept as a
      // fallback rather than assumed unreachable. Don't keep telling the
      // user to "assign" a lead that already has an owner in that case;
      // offer to change the owner instead (still routes to the same Edit
      // page either way).
      return lead.assignedToUserId
        ? { label: "Change Sales Person", hint: "Reassign this lead, or update the status to Contacted." }
        : { label: "Assign Sales Person", hint: "Pick who owns this lead to move it forward." };
    case "ASSIGNED":
      // Clicking this now opens ContactOutcomeDialog directly (see
      // LeadDetails.handleContactOutcomeConfirm) — logging Interested /
      // Not Interested / Could Not Reach moves the status forward on its
      // own, no separate manual Change Status trip needed.
      return { label: "Contact Customer", hint: "Reach out, then log what happened." };
    case "CONTACTED":
      // Clicking this opens ScheduleFollowUpDialog — usually just another
      // call reminder, but its "This is a scheduled Site Visit" checkbox
      // moves the lead to Site Visit in the same step once one's actually
      // been arranged with the customer (see ScheduleFollowUpDialog.tsx).
      return {
        label: "Schedule Follow-up",
        hint: "Set a Next Follow-up date — or check “Site Visit” once one's been arranged.",
      };
    case "SITE_VISIT":
      // Clicking this opens SiteVisitOutcomeDialog — Ready to Quote moves
      // to Qualified, Needs Another Visit stays here with a new date, Not
      // Viable closes it as Lost.
      return {
        label: "Complete Site Visit",
        hint: "Log what happened — mark it Qualified, schedule another visit, or close it out.",
      };
    case "QUALIFIED": {
      const latest = lead.quotations?.[0];
      // Reopened lead (e.g. was Lost, moved back to Qualified to requote):
      // the most recent quotation is REJECTED or EXPIRED and can't move
      // forward on its own — treat it the same as "no quotation yet" so the
      // rep can generate a fresh one instead of dead-ending at "View
      // Quotation" on a stale record. The old quotation stays on file as
      // history; this just stops it from blocking a new one.
      if (!latest || latest.status === "REJECTED" || latest.status === "EXPIRED") {
        return {
          label: "Generate Quotation",
          hint: latest
            ? `Quotation ${latest.quotationNumber} was ${latest.status === "REJECTED" ? "rejected" : "left unactioned and expired"} — generate a new one from this lead's current products.`
            : "This lead is Qualified — generate a quotation from its linked products.",
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
        // Customer Quotation Acceptance workflow: the customer decides via
        // the secure link in the email — this lead moves to WON
        // automatically on Accept (see LeadsService.recordQuotationAccepted()).
        hint: "The customer has been emailed a secure link to view, accept, or reject the quotation.",
      };
    case "WON":
      return lead.isConverted
        ? { label: "Deal Won", hint: "This lead has been converted to a Customer." }
        : { label: "Convert to Customer", hint: "Convert this Won lead into a Customer record." };
    case "LOST":
      // Bug fix: this used to say "change the status to Qualified to
      // requote them" — a reopen path that hasn't actually worked since
      // TC-080 made WON/LOST hard-terminal (LeadsService.updateStatus()
      // rejects any change away from either), and Change Status is no
      // longer even shown once a lead reaches here. Lost is final, same as
      // Won; if the customer comes back, that's a new opportunity —
      // capture it as a new Lead rather than reopening this one.
      return {
        label: "Lead Lost",
        hint: "This lead is closed. If the customer comes back, create a new Lead for them.",
      };
    default:
      return { label: "", hint: "" };
  }
}
