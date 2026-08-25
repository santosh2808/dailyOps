# Lead Management — Phase 1 Delivery Checklist

Workflow implemented: Create Lead → Assign Sales Person → Contact Customer → Schedule
Follow-up → Complete Site Visit → Mark Lead as Qualified → Generate Quotation → Preview
Quotation → Send Quotation to Customer.

Phase 2 (Customer Acceptance → Sales Order → Proforma Invoice → JEO) is explicitly **not**
implemented here. A lead-sourced quotation (one with no Customer yet) is blocked server-side
from ever reaching the ACCEPTED status, so the existing Sales Order/PI/JEO cascade from the
prior Sales Automation phase stays fully intact and untouched, but unreachable from this new
Lead → Quotation path until Phase 2 adds the Customer Acceptance step.

No existing module was regenerated. All work extends the current NestJS/Prisma/PostgreSQL
backend and React/Vite/TS/Tailwind frontend, following established conventions (soft delete via
`deletedAt`, auto-numbered document codes with retry-on-conflict, `RequirePermission` guards,
actor names captured server-side from the JWT, hand-authored migrations).

## 1. Files Created

Backend:
- `backend/prisma/migrations/20260825090000_replace_lead_status_enum/migration.sql`
- `backend/prisma/migrations/20260825091000_add_lead_history_note_followup_actions/migration.sql`
- `backend/prisma/migrations/20260825092000_lead_quotation_link/migration.sql`

Frontend: none — this phase only extended existing Lead/Quotation files.

## 2. Files Modified

Backend:
- `backend/prisma/schema.prisma` — `LeadStatus` enum replaced with
  `NEW, ASSIGNED, CONTACTED, SITE_VISIT, QUALIFIED, QUOTATION_SENT, WON, LOST`
  (existing `NEGOTIATION` rows remap to `QUOTATION_SENT`, `NOT_INTERESTED` rows remap to
  `LOST`); added `Lead.reminderNote`; added `LeadHistoryAction.NOTE_ADDED` /
  `.FOLLOWUP_ADDED`; `Quotation.customerId`/`customer` are now nullable, added nullable
  `Quotation.leadId`/`lead` relation + index
- `backend/src/leads/leads.module.ts` — exports `LeadsService` (needed by `QuotationsModule`)
- `backend/src/leads/leads.service.ts` — `LEAD_DETAIL_INCLUDE` now also returns
  `quotations` (id/number/status/createdAt only); added `getLeadForQuotationGeneration()`,
  `recordQuotationGenerated()`, `recordQuotationSent()`; `addNote()` now also writes a
  `NOTE_ADDED` Timeline entry; `update()` now writes a dedicated `FOLLOWUP_ADDED` Timeline
  entry when `nextFollowUp`/`priority`/`reminderNote` change (excluded from the generic
  "Edited" diff to avoid duplicates)
- `backend/src/leads/dto/create-lead.dto.ts` — added optional `reminderNote`
- `backend/src/dashboard/dashboard.service.ts` — fixed a `notIn` filter that referenced the
  now-removed `NOT_INTERESTED` status
- `backend/src/quotations/quotations.module.ts` — imports `LeadsModule`
- `backend/src/quotations/dto/create-quotation.dto.ts` — `customerId` now optional, added
  optional `leadId`, `items` now optional (still non-empty when provided)
- `backend/src/quotations/quotations.service.ts` — `create()` branches on `leadId` vs
  `customerId` (lead path derives items from the lead's own linked products and writes the
  "Quotation Generated" Timeline entry); `updateStatus()` refuses the ACCEPTED transition for
  any quotation with no `customerId`; `sendQuotation()` and `buildQuotationPdfInput()` now
  fall back to the linked Lead's contact fields when there is no Customer yet;
  `sendQuotation()` now also advances the Lead to `QUOTATION_SENT` + writes the "Quotation
  Sent" Timeline entry when the quotation is lead-sourced
- `backend/src/sales-orders/sales-orders.service.ts` — `createFromQuotation()` explicitly
  rejects a quotation with no `customerId` (defensive — unreachable via the API since
  `updateStatus()` already blocks it, but keeps the nullable type honest)

Frontend:
- `frontend/src/types/index.ts` — `LEAD_STATUSES` replaced (8 values, no `NEGOTIATION`/
  `NOT_INTERESTED`); added `Lead.reminderNote`, `Lead.quotations`; added
  `LEAD_HISTORY_ACTIONS.NOTE_ADDED`/`.FOLLOWUP_ADDED`; `Quotation.customerId`/`customer` now
  nullable, added `Quotation.leadId`/`lead`
- `frontend/src/components/leads/leadOptions.ts` — `STATUS_OPTIONS` replaced to match; added
  `nextActionFor(lead)` — the single source of truth for the "what do I do next" banner
- `frontend/src/components/leads/LeadActivityPanel.tsx` — rewritten to take a
  `view: "timeline" | "notes"` prop instead of its own 5-tab bar (Assignment History/Status
  History/Email History are folded into the Timeline feed, since `ASSIGNED`/`STATUS_CHANGED`
  already land there — their read endpoints are untouched and still used elsewhere)
- `frontend/src/pages/LeadDetails.tsx` — rebuilt around 4 tabs (Overview/Timeline/Notes/
  Attachments) plus a persistent "Next: <action>" banner and a one-click Generate Quotation
  action (routes straight to the new Quotation once created)
- `frontend/src/pages/LeadForm.tsx`, `frontend/src/api/leads.ts` — added `reminderNote` field
- `frontend/src/pages/LeadList.tsx` — table columns reduced to exactly Lead No / Company /
  Contact / Phone / Email / Source / Assigned To / Status / Next Follow-up / Last Updated /
  Actions (Priority/Est. Value/Products remain visible on Lead Details)
- `frontend/src/api/quotations.ts` — `QuotationPayload.customerId`/`items` now optional, added
  optional `leadId`; added `generateQuotationFromLead()`
- `frontend/src/pages/QuotationForm.tsx` — Edit mode now recognizes a lead-sourced quotation
  (shows the linked Lead instead of a Customer picker, never overwrites `customerId`)
- `frontend/src/pages/QuotationDetails.tsx` — Customer/Contact fields fall back to the linked
  Lead; "Create/View Sales Order" only shows once a Customer exists; added "Waiting for
  Customer Response" / "Send Quotation next" banners
- `frontend/src/components/quotations/ChangeQuotationStatusDialog.tsx` — hides the ACCEPTED
  option entirely for a lead-sourced quotation, instead of letting the user pick it and fail
- `frontend/src/components/quotations/SendQuotationDialog.tsx` — recipient email now falls
  back to the linked Lead's email when there's no Customer yet

## 3. Database Migrations

Three hand-authored migrations (Prisma's engine binary download is blocked in this sandbox —
same as every prior phase; the SQL below is what `npx prisma migrate dev` will apply):

1. `20260825090000_replace_lead_status_enum` — creates a new `LeadStatus` enum with the 8
   required values, remaps existing rows (`NEGOTIATION → QUOTATION_SENT`,
   `NOT_INTERESTED → LOST`) via a `CASE` expression on both `Lead.status` and
   `LeadStatusHistory.oldStatus`/`.newStatus`, then drops the old type and renames the new one
   into place. No data loss.
2. `20260825091000_add_lead_history_note_followup_actions` — two `ALTER TYPE ... ADD VALUE`
   statements (`NOTE_ADDED`, `FOLLOWUP_ADDED`) on `LeadHistoryAction`, each its own statement
   per Postgres's restriction on using a newly-added enum value inside the same transaction
   that added it.
3. `20260825092000_lead_quotation_link` — drops `NOT NULL` on `Quotation.customerId`, adds
   nullable `Quotation.leadId` with an `ON DELETE SET NULL` foreign key + index, and adds
   `Lead.reminderNote`.

**You still need to run**, in `backend/`:
```
npx prisma migrate dev
npx prisma generate
```

## 4. Seed Changes

None required — Sales Executive/Sales Manager already hold `Quotation.Create`/`.Edit` and
`Lead.Create`/`.Edit` permissions from earlier phases, which is everything this workflow needs.

## 5. API Changes

- `POST /api/v1/quotations` — `customerId` is now optional; a new optional `leadId` triggers
  the lead-sourced path (items are derived from the lead's own products, not from the request
  body — sending `items` alongside `leadId` is ignored). Exactly one of `customerId`/`leadId`
  is required; the response shape is unchanged.
- `PATCH /api/v1/quotations/:id/status` — now returns `400` if the target status is `ACCEPTED`
  and the quotation has no `customerId`.
- `POST /api/v1/quotations/:id/send` — behavior unchanged for existing (customer-sourced)
  quotations; for a lead-sourced quotation it now also advances the linked Lead to
  `QUOTATION_SENT`.
- `GET /api/v1/leads/:id` — response now additionally includes `quotations` (id, number,
  status, createdAt only, newest first).
- No existing endpoint was removed or had its request/response shape narrowed.

## 6. Testing Checklist

- [ ] `npx prisma migrate dev` applies cleanly against a database still containing leads in
      `NEGOTIATION`/`NOT_INTERESTED` — confirm they land on `QUOTATION_SENT`/`LOST`.
- [ ] Create a lead → status is `NEW` → Timeline shows "Lead Created".
- [ ] Assign a Sales Person → status becomes `ASSIGNED` → Timeline shows "Assigned".
- [ ] Change status through `CONTACTED` → `SITE_VISIT` → `QUALIFIED`, adding a note and a
      follow-up date along the way → Timeline shows "Status Changed", "Note Added", and
      "Follow-up Added" entries; Notes tab shows the note.
- [ ] With the lead `QUALIFIED` and no linked products, click Generate Quotation → expect a
      clear error, not a crash.
- [ ] Add at least one product to the lead, click Generate Quotation → a Quotation is created,
      Timeline shows "Quotation Generated", and the page navigates to the new Quotation.
- [ ] On the Quotation, Edit still works (no Customer picker shown), Preview PDF opens, then
      Send Quotation → Lead status becomes `QUOTATION_SENT`, Timeline shows "Quotation Sent",
      an Email History row is recorded.
- [ ] On that same quotation, attempt to change status to `ACCEPTED` — the option should not
      even appear in the dropdown.
- [ ] Existing customer-sourced quotations (from before this phase) still create/accept/cascade
      to Sales Order/PI/JEO exactly as before.
- [ ] Dashboard's Today's/Overdue/Upcoming Follow-up widgets still populate correctly.
- [ ] `cd backend && npx tsc --noEmit` and `cd frontend && npm run build` are both clean.

## 7. Manual Test Steps

1. Log in as a Sales Executive.
2. Leads → Create Lead → fill in company/contact/phone, add a product, save.
3. Open the lead → confirm the "Next: Assign Sales Person" banner.
4. Edit → assign yourself (or use "+ Add User" if the picker needs a new person) → save.
5. Back on Lead Details, confirm status is `ASSIGNED` and the banner now says
   "Next: Contact Customer".
6. Change Status → `CONTACTED`. Add a note in the Notes tab. Edit the lead to set a Next
   Follow-up date and a Reminder note.
7. Change Status → `SITE_VISIT`, then → `QUALIFIED`.
8. Confirm the banner now reads "Next: Generate Quotation" and click it.
9. You should land on the new Quotation's details page with the lead's product(s) as items.
10. Click Preview PDF — confirm it opens with the lead's company/contact as the customer.
11. Click Send Quotation, confirm/adjust the recipient email, send.
12. Confirm you're back on the Quotation with status `SENT`, and the Lead (via Leads list or
    Lead Details) now shows status `QUOTATION_SENT` with a "Waiting for Customer Response"
    banner.
13. Confirm there is no way to mark this quotation `ACCEPTED` from the UI.
