-- Removed (per business owner): SalesOrder.advancePercentage was a
-- manually-typed field, never read anywhere else in the app (confirmed by a
-- full-codebase search before removal) and never kept in sync with the real
-- advance actually received (that live figure comes from
-- ProformaInvoice.advanceReceived / grandTotal, computed at display time —
-- see SalesOrderDetails.tsx, whose own pre-existing comment already flagged
-- this field as stale under QA ticket SC-002).
-- AlterTable
ALTER TABLE "SalesOrder" DROP COLUMN "advancePercentage";
