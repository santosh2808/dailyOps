import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/errors";
import { regenerateProformaInvoiceFromSalesOrder } from "@/api/proforma-invoices";
import type { ProformaInvoice } from "@/types";

interface ConfirmRegenerateProformaInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: ProformaInvoice | null;
  onSaved: (updated: ProformaInvoice) => void;
}

function formatCurrency(value?: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

// QA bug fix (SC-006): subtotal/discount/tax/grandTotal are copied onto a
// Proforma Invoice only once, when it's generated — editing the linked
// Sales Order afterward never re-syncs them (see
// ProformaInvoicesService.regenerateFromSalesOrder() for the root cause).
// This dialog previews the old-vs-new totals before pulling the current
// Sales Order amounts back in, and makes explicit that the advance already
// recorded against this invoice is never touched by this action — it stays
// exactly as recorded either way.
export default function ConfirmRegenerateProformaInvoiceDialog({
  open,
  onOpenChange,
  invoice,
  onSaved,
}: ConfirmRegenerateProformaInvoiceDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!invoice) return null;

  const salesOrder = invoice.salesOrder;
  const isUpToDate =
    !!salesOrder &&
    salesOrder.subtotal === invoice.subtotal &&
    salesOrder.discount === invoice.discount &&
    salesOrder.tax === invoice.tax &&
    salesOrder.grandTotal === invoice.grandTotal;

  async function handleConfirm() {
    setSubmitting(true);
    setError("");
    try {
      const updated = await regenerateProformaInvoiceFromSalesOrder(invoice!.id);
      onSaved(updated);
      toast.success("Proforma invoice totals updated from the sales order.");
      onOpenChange(false);
    } catch (err) {
      const message = getErrorMessage(err, "Could not regenerate this invoice. Please try again.");
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)} size="sm">
        <DialogHeader>
          <DialogTitle>Regenerate from Sales Order?</DialogTitle>
          <DialogDescription>
            This pulls the current subtotal, discount, tax and grand total from{" "}
            <span className="font-medium text-slate-900">
              {salesOrder?.salesOrderNumber ?? "the linked sales order"}
            </span>{" "}
            back onto this invoice.
          </DialogDescription>
        </DialogHeader>

        {isUpToDate ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-900">
              These totals already match the sales order — regenerating won't change anything.
            </p>
          </div>
        ) : (
          <div className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <div className="grid grid-cols-3 gap-2 font-medium text-destructive">
              <span></span>
              <span>Current</span>
              <span>New</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCurrency(invoice.subtotal)}</span>
              <span>{formatCurrency(salesOrder?.subtotal)}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <span className="text-muted-foreground">Discount</span>
              <span>{formatCurrency(invoice.discount)}</span>
              <span>{formatCurrency(salesOrder?.discount)}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <span className="text-muted-foreground">Tax (GST)</span>
              <span>{formatCurrency(invoice.tax)}</span>
              <span>{formatCurrency(salesOrder?.tax)}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 font-semibold text-slate-900">
              <span className="font-normal text-muted-foreground">Grand Total</span>
              <span>{formatCurrency(invoice.grandTotal)}</span>
              <span>{formatCurrency(salesOrder?.grandTotal)}</span>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Advance received ({formatCurrency(invoice.advanceReceived)}) is not affected — it stays
          recorded as-is regardless of how the totals change.
        </p>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={submitting || isUpToDate}>
            {submitting && <Spinner className="mr-2 h-4 w-4" />}
            {submitting ? "Regenerating..." : "Regenerate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
