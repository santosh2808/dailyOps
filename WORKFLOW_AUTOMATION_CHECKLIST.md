# Lead → Quotation → Customer Workflow Automation

## What changed

Before this change, approving a Quotation (status → `ACCEPTED`) only flipped
its status column. The user then had to separately click "Create Sales
Order" on the Quotation Details page, review a form, and submit it before a
Sales Order actually existed. That manual step was the "workflow stops"
problem.

Now, the moment a Quotation is approved, a Sales Order is created
automatically from the Quotation's own items, and the user is redirected
straight to the new Sales Order's detail page:

```
Lead → Quotation → Quotation Approved → (Convert to Customer, unchanged)
     → Automatically Create Sales Order → Redirect to Sales Order Details
```

From the Sales Order screen, "Generate Proforma Invoice" and "Generate Job
Execution Order (JEO)" were **already implemented** in earlier project work
and required no changes — see Audit Findings below.

## Audit findings (already correct, untouched)

- **Sales Order is already the parent document.** `SalesOrder.quotationId`
  is unique; `ProformaInvoice.salesOrderId` and `JobExecutionOrder.salesOrderId`
  are required foreign keys to `SalesOrder`. No schema change was needed.
- **Duplicate Sales Order prevention already exists.** `SalesOrdersService.create()`
  checks `prisma.salesOrder.findUnique({ where: { quotationId } })` and throws
  `ConflictException` if one already exists — enforced by the unique DB
  constraint as a backstop. The new automatic path reuses this same guard
  (see below) and is additionally idempotent on top of it.
- **Customer is only ever created once.** A Quotation always requires a
  pre-existing `customerId` (Quotations are never created directly from a
  Lead). The only place a Customer is created from a Lead is
  `LeadsService.convertToCustomer()`, which already has an `isConverted`
  guard preventing a second conversion.
- **Generate Proforma Invoice / Generate JEO already exist** on
  `SalesOrderDetails.tsx`, each with client-side "already generated → View
  instead of Generate" checks and server-side `ConflictException` guards
  against duplicates. No work was required here.

## Files modified

Backend:
- `backend/src/sales-orders/sales-orders.service.ts` — added
  `createFromQuotation(quotationId, createdBy?)`. It derives Sales Order
  items 1:1 from the Quotation's own items and calls the existing `create()`
  method internally, so salesOrderNumber generation, the ACCEPTED-only
  guard, the duplicate-Sales-Order guard, and totals computation all run
  through the exact same code path as manual creation. If a Sales Order
  already exists for the quotation, it returns the existing one instead of
  throwing (idempotent).
- `backend/src/sales-orders/sales-orders.module.ts` — exports
  `SalesOrdersService` so `QuotationsModule` can inject it.
- `backend/src/quotations/quotations.module.ts` — imports `SalesOrdersModule`.
- `backend/src/quotations/quotations.service.ts` — `updateStatus()` now
  accepts an `actorName` parameter and, only on the transition **into**
  `ACCEPTED` (not on every save of an already-Accepted quotation), calls
  `salesOrdersService.createFromQuotation()`. The response is the existing
  Quotation shape plus an additive `salesOrder` field (`{ id,
  salesOrderNumber } | null`).
- `backend/src/quotations/quotations.controller.ts` — `updateStatus` now
  reads `req.user?.name` (JWT payload, never the request body) and passes it
  through as the Sales Order's `createdBy`.

Frontend:
- `frontend/src/api/quotations.ts` — `updateQuotationStatus()`'s return type
  now includes the additive `salesOrder` field.
- `frontend/src/pages/QuotationDetails.tsx` — `handleStatusConfirm()` now
  redirects to `/sales-orders/:id` when the response includes a
  `salesOrder`; otherwise it refetches the quotation exactly as before. The
  existing manual "Create Sales Order" / "View Sales Order" buttons and the
  `existingSalesOrderId` lookup are left in place unchanged — they remain
  the fallback for any Quotation that was already `ACCEPTED` before this
  change shipped (it has no Sales Order yet, so automatic creation never
  ran for it) and back-fill it manually.

## Database changes

None. The schema already had everything this feature needed (`SalesOrder.quotationId`
unique constraint, `Quotation.salesOrder` back-relation, `ProformaInvoice.salesOrderId`
/ `JobExecutionOrder.salesOrderId` foreign keys). No migration is required.

## Testing checklist

1. Create a Quotation for a Customer, add items, save as `DRAFT`.
2. Change status to `SENT`, then to `ACCEPTED` via "Change Status" on
   Quotation Details.
   - Expect: immediate redirect to a new Sales Order's detail page (no
     manual form).
   - Expect: the Sales Order's items match the Quotation's items
     (product, quantity, unit price).
   - Expect: `Sales Order.customerId` equals the Quotation's customer.
3. On the new Sales Order Details page, confirm both "Generate Proforma
   Invoice" and "Generate JEO" buttons are present and each opens its
   dialog.
4. Generate a Proforma Invoice; confirm it references this Sales Order and
   the button changes to "View Proforma Invoice".
5. Generate a JEO; confirm it references this Sales Order and the button
   changes to "View JEO".
6. Re-open the same Quotation and click "Change Status" again, setting it
   to `ACCEPTED` again (or another status and back to `ACCEPTED`).
   - Expect: no duplicate Sales Order is created; the existing one is
     reused (verify via `GET /api/v1/sales-orders?quotationId=<id>` — only
     one row).
7. Attempt to manually `POST /api/v1/sales-orders` with the same
   `quotationId` a second time.
   - Expect: `409 Conflict` — "A Sales Order has already been created from
     this Quotation" (unchanged existing behavior).
8. Take a Lead through Won → Convert to Customer, and attempt to convert it
   a second time.
   - Expect: conversion is blocked/no-ops (unchanged `isConverted` guard) —
     confirms Customer is only ever created once.
9. For a Quotation that was already `ACCEPTED` before this change (no
   Sales Order yet), open its details page.
   - Expect: the manual "Create Sales Order" button still appears and still
     works (backward-compatible fallback).
10. Confirm a user with `Quotation.Approve` but without `SalesOrder.Create`
    permission can still trigger the automatic creation (it runs
    server-side, not through the `POST /sales-orders` permission check).
11. Run `npx prisma migrate dev` — expect no pending migrations (no schema
    change was made).
12. Backend: `npx tsc --noEmit` — no new error categories beyond the
    pre-existing "Prisma client not generated" baseline.
13. Frontend: `npm run build` — builds clean.
