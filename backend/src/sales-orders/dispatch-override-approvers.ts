// The two people who may authorize dispatching an order that hasn't yet
// received 50% advance (see SalesOrdersService.updateStatus()) — recording
// an advance payment below that same 50% (see
// ProformaInvoicesService.updateAdvance(), SC-011) — and, as of the
// production-start gate, generating a JEO below that same 50% (see
// JobExecutionOrdersService.create()). Neither is a real User account
// in this system (no login/RBAC entity for them), so this is a fixed
// allow-list compared against a plain scalar, not a User relation — same
// "fixed named constant" convention as jeo-pdf.service.ts's CHANNEL_NAME.
// Kept here (rather than a Settings screen) since there's no admin UI for
// managing this two-person list and it's expected to change rarely, if
// ever.
//
// Split into its own file (rather than living in sales-orders.service.ts)
// so all three services — plus UpdateSalesOrderStatusDto's,
// UpdateProformaInvoiceAdvanceDto's, and CreateJeoDto's @IsIn() validators
// — can import it without a circular import.
export const DISPATCH_OVERRIDE_APPROVERS = ['Santosh Kumar Chegondi', 'Amarpal Gampa'] as const;
export type DispatchOverrideApprover = (typeof DISPATCH_OVERRIDE_APPROVERS)[number];

// Company payment policy (per business owner, SC-011): a Sales Order's
// Quotation already asks for 50% advance by default, and dispatch has
// required 50% advance for a while now (see the constant this replaces
// below) — Record Advance Payment enforces that same 50%-of-grandTotal
// minimum at the point of entry, not just at the later dispatch gate, with
// the same named-approver override for the cases where there genuinely is
// no advance yet. One shared constant so the two gates can never drift
// apart from each other.
export const MINIMUM_ADVANCE_PERCENT = 50;

// Override Approval workflow (replaces the old self-declare dropdown —
// see OverrideApprovalRequest's schema comment): the email address to send
// an approval-request link to for each named approver above. Env-driven
// (not hardcoded) since an email address is contact info, not a fixed
// business constant like the name itself. Deliberately does NOT throw if
// unset — OverrideApprovalsService.notifyApprovers() skips (and logs) any
// approver with no email on file rather than failing the whole request,
// same "never let a missing config value break a business action"
// convention as MailerService itself.
const APPROVER_EMAILS: Record<DispatchOverrideApprover, string | undefined> = {
  'Santosh Kumar Chegondi': process.env.APPROVER_SANTOSH_EMAIL?.trim() || undefined,
  'Amarpal Gampa': process.env.APPROVER_AMAR_EMAIL?.trim() || undefined,
};

export function approverEmail(name: DispatchOverrideApprover): string | undefined {
  return APPROVER_EMAILS[name];
}

// Every approver with an email on file — used to send the same "Approval
// Requested" email to both named approvers at once (either may decide it).
export function allApproverEmails(): { name: DispatchOverrideApprover; email: string }[] {
  return DISPATCH_OVERRIDE_APPROVERS.map((name) => ({ name, email: approverEmail(name) })).filter(
    (entry): entry is { name: DispatchOverrideApprover; email: string } => Boolean(entry.email),
  );
}
