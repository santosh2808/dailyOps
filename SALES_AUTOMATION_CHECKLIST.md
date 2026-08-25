# Sales Automation Workflow — Delivery Checklist

Workflow implemented: Lead → Assign Sales Person → Follow-up → Qualified → Create Quotation →
Review Pricing → Send Quotation (Email) → Customer Response → Accepted → Convert Lead to
Customer → Automatically Create Sales Order → Automatically Generate Proforma Invoice →
Automatically Generate JEO → Notify Factory.

No existing module was regenerated. All work extends the current NestJS/Prisma/PostgreSQL
backend and React/Vite/TS/Tailwind frontend, following the established conventions in the
codebase (soft delete via `deletedAt`, auto-numbered document codes with retry-on-conflict,
`RequirePermission` guards, `createdBy`/actor captured server-side from the JWT, idempotent
`createFromX()` wrappers).

## 1. Files Created

Backend:
- `backend/src/audit-log/` — `audit-log.service.ts`, `dto/query-audit-log.dto.ts`,
  `audit-log.controller.ts`, `audit-log.module.ts`
- `backend/src/approval-matrix/` — `dto/create-approval-matrix.dto.ts`,
  `dto/update-approval-matrix.dto.ts`, `approval-matrix.service.ts`,
  `approval-matrix.controller.ts`, `approval-matrix.module.ts`
- `backend/src/email-templates/` — `dto/create-email-template.dto.ts`,
  `dto/update-email-template.dto.ts`, `email-templates.service.ts`,
  `email-templates.controller.ts`, `email-templates.module.ts`
- `backend/src/mailer/` — `mailer.service.ts`, `mailer.module.ts`
- `backend/src/pdf/` — `pdf.service.ts`, `pdf.module.ts`
- `backend/src/quotations/dto/send-quotation.dto.ts`,
  `dto/request-quotation-approval.dto.ts`, `dto/decide-quotation-approval.dto.ts`
- `backend/prisma/migrations/20260824090000_add_sales_automation_enums/migration.sql`
- `backend/prisma/migrations/20260824091000_add_sales_automation_tables/migration.sql`

Frontend:
- `frontend/src/api/email-templates.ts`, `frontend/src/api/approval-matrix.ts`,
  `frontend/src/api/audit-log.ts`
- `frontend/src/components/quotations/SendQuotationDialog.tsx`
- `frontend/src/components/email-templates/EditEmailTemplateDialog.tsx`
- `frontend/src/components/EmailHistoryCard.tsx` (shared Email History list, used on
  Sales Order / Proforma Invoice / JEO Details)
- `frontend/src/pages/QuotationApprovals.tsx` — Approvals inbox
- `frontend/src/pages/EmailTemplates.tsx` — Administrator-only template editor

## 2. Files Modified

Backend:
- `backend/prisma/schema.prisma` — new fields (`Product.standardPrice/minPrice/maxDiscountPercent`,
  `Quotation.sentAt/sentBy/sentToEmail`), new enum values (`QuotationStatus.READY`,
  4 new `LeadHistoryAction` values), 5 new models (`EmailTemplate`, `EmailHistory`,
  `ApprovalMatrix`, `QuotationApprovalRequest`, `AuditLog`)
- `backend/src/quotations/*` — Price Validation + Approval Matrix gate on the ACCEPTED
  transition, Send Quotation, PDF, approval request/decide endpoints
- `backend/src/sales-orders/*`, `backend/src/proforma-invoices/*`,
  `backend/src/job-execution-orders/*` — automatic email on create/dispatch, Email History
  endpoint, Audit Log entries
- `backend/src/leads/*` — synthesized history entries for the 4 new action types,
  Assignment History / Status History / Email History read endpoints (these tables existed
  but had no read endpoint before this change)
- `backend/src/products/dto/create-product.dto.ts` — price validation fields
- `backend/src/dashboard/dashboard.service.ts` — 6 new counts + Sales by Executive
- `backend/prisma/seed.ts` — 5 new permissions, Approval Matrix seed rows, 5 Email Template rows
- `backend/src/app.module.ts` — new module registrations

Frontend:
- `frontend/src/types/index.ts` — all new types/enums (also fixed a pre-existing malformed
  `/` comment in `DashboardStats` that would have failed `tsc`)
- `frontend/src/api/quotations.ts`, `leads.ts`, `sales-orders.ts`, `proforma-invoices.ts`,
  `job-execution-orders.ts`, `products.ts` — new endpoints/fields
- `frontend/src/components/quotations/ChangeQuotationStatusDialog.tsx` — Price Validation /
  Approval Matrix error handling with Update Price / Request Approval actions
- `frontend/src/components/leads/LeadActivityPanel.tsx` — Assignment History, Status History,
  Email History tabs; extended action icon/label maps for the 4 new history actions
- `frontend/src/components/products/ProductFormDialog.tsx`,
  `ProductViewDialog.tsx` — Standard Price / Minimum Price / Max Discount % fields
- `frontend/src/pages/QuotationDetails.tsx` — Send Quotation, View PDF, Email History card
- `frontend/src/pages/SalesOrderDetails.tsx`, `ProformaInvoiceDetails.tsx`,
  `JobExecutionOrderDetails.tsx` — Email History card
- `frontend/src/pages/Dashboard.tsx` — 6 new summary cards + Sales by Executive chart
- `frontend/src/components/Sidebar.tsx`, `frontend/src/App.tsx` — new nav entries/routes for
  Quotation Approvals and Email Templates

## 3. Database Migrations

Two hand-authored migrations (Prisma CLI can't download its engine binary in this sandbox, so
these were written by hand — apply with `npx prisma migrate dev` after pulling):

1. `20260824090000_add_sales_automation_enums` — `ALTER TYPE ... ADD VALUE` statements only
   (Postgres forbids using a new enum value in the same transaction it's added in, so this
   must run before the next migration).
2. `20260824091000_add_sales_automation_tables` — new columns on `Product` and `Quotation`,
   and the 5 new tables (`EmailTemplate`, `EmailHistory`, `ApprovalMatrix`,
   `QuotationApprovalRequest`, `AuditLog`) with their foreign keys and indexes.

## 4. Seed Changes

- 5 new `Permission` rows: `ApprovalMatrix.View/Edit`, `EmailTemplate.View/Edit`, `AuditLog.View`
  (Administrator receives all of them automatically via the existing `ROLE_PERMISSIONS.Administrator
  = PERMISSIONS.map(...)` pattern — no new bypass logic was added anywhere).
- `ApprovalMatrix` seeded for the `Quotation` module per the example given: 0–5% → Sales
  Executive, 5–10% → Sales Manager, >10% → Administrator.
- 5 `EmailTemplate` rows upserted by `key`: Quotation, Order Confirmation, Proforma Invoice,
  JEO Notification, Dispatch — each with a usable default subject/body that Administrators can
  edit from Email Templates.

## 5. API Endpoints (new)

- `POST /api/v1/quotations/:id/send` — generate PDF, send email, record Email History, set
  status=Sent
- `GET /api/v1/quotations/:id/pdf`, `GET /api/v1/quotations/:id/email-history`
- `POST /api/v1/quotations/:id/request-approval`, `GET /api/v1/quotations/approval-requests`,
  `PATCH /api/v1/quotations/approval-requests/:requestId/decide`
- `GET /api/v1/sales-orders/:id/email-history`
- `GET /api/v1/proforma-invoices/:id/email-history`
- `GET /api/v1/job-execution-orders/:id/email-history`
- `GET /api/v1/leads/:id/assignment-history`, `GET /api/v1/leads/:id/status-history`,
  `GET /api/v1/leads/:id/email-history`
- `GET/POST/PATCH /api/v1/email-templates` (Administrator-gated Edit)
- `GET/POST/PATCH/DELETE /api/v1/approval-matrix`
- `GET /api/v1/audit-log`

## 6. Testing Checklist

- [ ] Run `npx prisma migrate dev` in `backend/` to apply both new migrations, then
      `npx prisma generate` and `npm run seed`.
- [ ] Set SMTP env vars (`SMTP_HOST/PORT/USER/PASS/SECURE/FROM`) to send real email, or leave
      unset to confirm the "SIMULATED" fallback still records Email History without failing.
- [ ] Set `FINANCE_TEAM_EMAIL` and `FACTORY_NOTIFICATION_EMAIL` env vars for the Proforma
      Invoice CC and JEO factory notification respectively.
- [ ] Create a Product with Standard Price / Minimum Price / Max Discount % set.
- [ ] Create a Lead, assign a Sales Person, add a follow-up date and Notes, move it through
      statuses, confirm Assignment History / Status History / Email History tabs populate.
- [ ] Create a Quotation with an item priced below the product's Minimum Price → attempt to
      accept → confirm the blocked-with-details dialog appears with Update Price / Request
      Approval actions.
- [ ] Submit a Request Approval, then log in as the required role (or Administrator) and
      decide it from the new Quotation Approvals page → confirm it completes the ACCEPTED
      cascade (Customer, Sales Order, Proforma Invoice, JEO, factory email).
- [ ] Use Send Quotation on a DRAFT/READY quotation → confirm status becomes SENT, sentAt/sentBy
      are populated, and an Email History row appears.
- [ ] Accept a quotation directly (no approval needed) → confirm Sales Order → Proforma Invoice
      → JEO are all auto-created and each has an Email History entry.
- [ ] Edit an Email Template as Administrator → confirm the next automated email uses the
      updated subject/body.
- [ ] Check the Dashboard for the 6 new cards and the Sales by Executive chart.
- [ ] Confirm a non-Administrator, non-required-role user is blocked from deciding an approval
      request (403) and from editing Email Templates / Approval Matrix (hidden from nav, 403
      if hit directly).

## 7. Manual Testing Steps (happy path)

1. Log in as Administrator. Go to Leads → New Lead, fill in details, assign to a Sales
   Executive.
2. Open the lead, add a follow-up date/priority and a note, move status to Qualified.
3. Go to Quotations → New Quotation for that lead's customer, add line items with prices at or
   above the product's Standard Price.
4. Open the quotation → Send Quotation → confirm recipient email → confirm status becomes Sent
   and an email appears in Email History.
5. Change status to Accepted → confirm redirect to the auto-created Sales Order.
6. On the Sales Order, confirm a Proforma Invoice and a Job Execution Order were already
   generated (visible via "View Proforma Invoice" / "View JEO"), each with their own Email
   History entry (customer+finance CC on the invoice, factory notification on the JEO).
7. Back on the Dashboard, confirm the new widgets reflect the updated counts.

## 8. Build Verification (this session)

- `cd backend && npx tsc --noEmit` — 250 lines of output, all within the 4 known "Prisma client
  not generated" categories (expected in this sandbox, since `prisma generate` can't run here);
  zero new error categories introduced.
- `cd frontend && npm run build` — `tsc -b && vite build` completed with zero errors.
