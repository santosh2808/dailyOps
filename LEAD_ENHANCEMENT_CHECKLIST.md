# Lead Module Enhancement — Delivery Notes

Scope: extend the existing Lead module only (Source/Assigned To/Last Updated columns, Lead History, Lead Notes, Assignment History, Status History, Dashboard follow-up widgets). No existing functionality was changed — every write path that already worked (Create, Edit, Status Update, Delete, Convert to Customer, Import) behaves exactly as before, with history logging added alongside it.

Run `npx prisma migrate dev` then restart the backend to pick up the schema changes (see README for the general setup). No seed changes were needed for this work.

## 1. Files Modified

### Backend

- `backend/prisma/schema.prisma` — added `LeadHistoryAction` enum and four new models (`LeadHistory`, `LeadNote`, `LeadAssignmentHistory`, `LeadStatusHistory`); added the corresponding back-relations on `Lead`. No existing model fields changed.
- `backend/prisma/migrations/20260821100000_add_lead_history_notes/migration.sql` — new, hand-authored migration creating the four tables above plus the enum.
- `backend/src/leads/leads.service.ts` — `create()`, `update()`, `updateStatus()`, `convertToCustomer()` now each log a `LeadHistory` entry inside their existing `$transaction` (or a newly added one, for `create()`/`updateStatus()`); `update()` additionally writes a `LeadAssignmentHistory` row when `assignedTo` changes, and `updateStatus()` writes a `LeadStatusHistory` row when the status actually changes. Added `getHistory()`, `getNotes()`, `addNote()`, and two small private helpers (`logHistory`, `diffLeadFields`). Every existing method's return value and validation behavior is unchanged.
- `backend/src/leads/leads.controller.ts` — `create`, `update`, `updateStatus`, `convert` now also accept `@Req()` to capture `req.user?.name` as the actor for history/audit rows (same pattern already used by `sales-orders.controller.ts` for `createdBy`). Added three routes: `GET /api/v1/leads/:id/history`, `GET /api/v1/leads/:id/notes`, `POST /api/v1/leads/:id/notes` (gated by the existing `Lead.View`/`Lead.Edit` permission codes — no new Permission rows added).
- `backend/src/leads/dto/update-lead-status.dto.ts` — added an optional `remarks?: string` field.
- `backend/src/leads/dto/create-lead-note.dto.ts` — new DTO, `{ note: string }`.
- `backend/src/dashboard/dashboard.service.ts` — `DashboardStats` gained `todaysFollowUpsCount`, `overdueFollowUpsCount`, `leadSourceSummary`; `getStats()` computes all three additively alongside the existing counts (which are all unchanged).

### Frontend

- `frontend/src/types/index.ts` — added `LeadHistoryAction`, `LeadHistoryEntry`, `LeadNote`, `LeadAssignmentHistory`, `LeadStatusHistoryEntry`, `LeadSourceSummaryEntry` types; extended `DashboardStats` with the three new fields above.
- `frontend/src/api/leads.ts` — `updateLeadStatus()` now accepts an optional `remarks` argument; added `getLeadHistory()`, `getLeadNotes()`, `addLeadNote()`.
- `frontend/src/components/leads/ChangeStatusDialog.tsx` — added an optional Remarks textarea; `onConfirm` now passes `(status, remarks?)`.
- `frontend/src/components/leads/LeadActivityPanel.tsx` — new component: a History/Notes toggle used on Lead Details, replacing the old "coming in a future release" placeholder.
- `frontend/src/pages/LeadDetails.tsx` — swapped the placeholder "Timeline" card for `LeadActivityPanel`; `handleStatusConfirm`/`handleConvertConfirm` now also refresh it.
- `frontend/src/pages/LeadList.tsx` — added **Source** and **Last Updated** columns (Assigned To already existed).
- `frontend/src/pages/Dashboard.tsx` — added **Today's Follow-ups** / **Overdue Follow-ups** summary cards and a **Lead Source Summary** bar-list card.

## 2. Database Changes

New enum:

- `LeadHistoryAction`: `CREATED`, `EDITED`, `ASSIGNED`, `STATUS_CHANGED`, `QUOTATION_CREATED`, `CUSTOMER_CONVERTED`.

New tables (all cascade-delete with their parent `Lead`, all append-only — nothing here is ever updated or deleted through the API):

- `LeadHistory(id, leadId, action, description, performedBy, createdAt)` — the unified timeline. Every row is written by the backend itself; `QUOTATION_CREATED` entries are the one exception and are **not** stored here at all — they're synthesized at read time (see below).
- `LeadNote(id, leadId, note, createdBy, createdAt)` — free-text notes, unlimited per lead.
- `LeadAssignmentHistory(id, leadId, previousUser, newUser, changedBy, createdAt)`.
- `LeadStatusHistory(id, leadId, oldStatus, newStatus, remarks, changedBy, createdAt)`.

No columns were added to, removed from, or changed on the existing `Lead` table (or any other existing table).

**Design note — "Quotation Created" history entries:** the `Quotation` table has no foreign key back to `Lead` (this was a deliberate earlier decision in this codebase, to avoid a cross-module FK). Rather than add one now — which would mean touching the Quotations module, contrary to "only extend the Lead module" — `GET /api/v1/leads/:id/history` joins on `Lead.customerId` (set only once a lead is converted) to find that customer's Quotations and folds them into the returned timeline as `QUOTATION_CREATED` entries. This means: a lead that hasn't been converted yet will never show a Quotation Created entry, because under the current data model nothing could have linked a Quotation to it anyway. This is a read-time computation only — nothing is written to the Quotations tables, and the Quotations module's own code was not touched.

## 3. Testing Checklist

- [ ] **Source / Assigned To / Last Updated columns** — open Leads list. Confirm the table now shows Source and Last Updated columns (Assigned To was already there). Edit a lead's Source or reassign it, save, and confirm the list reflects the new value and a refreshed Last Updated date after the page reloads.
- [ ] **Created** — create a new lead. Open its Details page → History tab. Confirm a single "Created" entry appears with the current user's name and a timestamp matching creation time.
- [ ] **Edited** — edit an existing lead's Company Name (or any non-assignment field) and save. Confirm a new "Edited" entry appears listing the changed field(s). Save again with no changes at all — confirm no new "Edited" entry is added (no-op edits are not logged).
- [ ] **Assigned** — change a lead's "Assigned To" value via Edit. Confirm (a) a new "Assigned" entry appears in History with the from/to names, and (b) a corresponding row exists in `LeadAssignmentHistory` (previousUser/newUser/changedBy/date) — check via `GET /api/v1/leads/:id/history` or a DB query.
- [ ] **Status Changed** — use "Change Status" on a lead, pick a different status, add Remarks, confirm. Confirm a "Status Changed" entry appears in History showing old → new status, and a `LeadStatusHistory` row exists with the old status, new status, remarks, and the changed-by user. Repeat with the *same* status re-selected — confirm no new Status Changed/History row is written.
- [ ] **Quotation Created** — convert a WON lead to a Customer, then create a Quotation for that same customer (via the existing Quotations screen — do not modify that flow). Reopen the lead's History tab and confirm the Quotation now appears as a "Quotation Created" entry, sorted correctly by date alongside the other entries. Confirm a lead that has **not** been converted never shows this entry type, even if a Quotation happens to exist for an unrelated customer.
- [ ] **Customer Converted** — convert a WON lead. Confirm a "Customer Converted" entry appears in History naming the new customer, immediately after conversion (no page refresh needed beyond the normal post-action reload).
- [ ] **History tab ordering** — with a lead that has several of the above events, confirm the History tab lists them newest-first and each entry shows action, description, actor (where applicable), and timestamp.
- [ ] **Lead Notes** — on a lead's Details page, switch to the Notes tab, add several notes in a row. Confirm all persist (reload the page) and display newest-first with author and timestamp. Confirm there's no limit encountered adding many notes.
- [ ] **Dashboard — Today's Follow-ups** — set a lead's Next Follow-up to today's date (and make sure it's not WON/LOST/NOT_INTERESTED). Confirm the Dashboard's "Today's Follow-ups" count includes it. Change the status to WON/LOST/NOT_INTERESTED and confirm the count drops by one.
- [ ] **Dashboard — Overdue Follow-ups** — set a different open lead's Next Follow-up to a past date. Confirm it's counted under "Overdue Follow-ups" and not under "Today's Follow-ups".
- [ ] **Dashboard — Lead Source Summary** — confirm the widget lists every Source present among non-deleted leads with an accurate count per source, and that the bars are roughly proportional to the counts.
- [ ] **Regression** — run through one full existing Lead flow (Create → Edit → Import → Change Status → Delete → Convert) end to end and confirm every pre-existing behavior (auto-numbered Lead Number, soft delete via `deletedAt`, Excel import/export, permission checks) is completely unchanged; the only difference should be that History/Notes now populate alongside it.
