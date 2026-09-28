import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/errors";
import type { ProformaInvoice } from "@/types";

interface RecordAdvancePaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: ProformaInvoice | null;
  // Linked Sales Order's grandTotal — the minimum advance is
  // MINIMUM_ADVANCE_PERCENT% of this. Passed in from SalesOrderDetails.tsx,
  // which already has it in scope.
  salesOrderGrandTotal: number;
  onConfirm: (advanceReceived: number) => Promise<void>;
}

// QA feature (SC-011): Record Advance Payment enforces a minimum — 50% of
// the linked Sales Order's grandTotal (MINIMUM_ADVANCE_PERCENT, same
// threshold as the dispatch gate). Override Approval workflow: below that
// threshold there is no self-declare escape hatch anymore — the backend
// raises a real OverrideApprovalRequest and emails Santosh Kumar Chegondi /
// Amarpal Gampa a one-click approve/reject link (mirrors
// ChangeSalesOrderStatusDialog.tsx exactly).
const MINIMUM_ADVANCE_PERCENT = 50;

function formatRupees(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

// Records/updates the actual advance amount received against a Proforma
// Invoice — the one thing that previously had no update path after the
// invoice was first generated (see backend schema.prisma comment on
// advanceReceived). This is what unblocks the Sales Order dispatch gate and
// enables generating the final Tax Invoice.
export default function RecordAdvancePaymentDialog({
  open,
  onOpenChange,
  invoice,
  salesOrderGrandTotal,
  onConfirm,
}: RecordAdvancePaymentDialogProps) {
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // True when the backend's 409 response means "an approval request has
  // been emailed" rather than an ordinary failure — styled as an
  // informational notice instead of a red error.
  const [approvalRequested, setApprovalRequested] = useState(false);

  useEffect(() => {
    if (open && invoice) {
      setAmount(String(invoice.advanceReceived ?? 0));
      setError("");
      setApprovalRequested(false);
    }
  }, [open, invoice]);

  const requiredAdvance = salesOrderGrandTotal > 0 ? (salesOrderGrandTotal * MINIMUM_ADVANCE_PERCENT) / 100 : 0;
  const parsedAmount = Number(amount);
  const validAmount = amount.trim() !== "" && !Number.isNaN(parsedAmount) && parsedAmount >= 0;
  const belowThreshold = validAmount && parsedAmount < requiredAdvance;

  async function handleConfirm() {
    setError("");
    setApprovalRequested(false);
    if (!validAmount) {
      setError("Enter a valid, non-negative amount.");
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(parsedAmount);
      onOpenChange(false);
    } catch (err) {
      const message = getErrorMessage(err, "Could not record the advance payment. Please try again.");
      const isApprovalConflict = isAxiosError(err) && err.response?.status === 409;
      setError(message);
      setApprovalRequested(isApprovalConflict);
      if (isApprovalConflict) {
        toast.info(message, "Approval requested");
      } else {
        toast.error(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Record Advance Payment</DialogTitle>
          <DialogDescription>
            Total amount received so far against{" "}
            <span className="font-medium text-slate-900">{invoice.invoiceNumber}</span>. This unblocks
            dispatch and the final Tax Invoice once it's greater than zero.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="advanceReceivedAmount">Advance Received</Label>
          <Input
            id="advanceReceivedAmount"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError("");
              setApprovalRequested(false);
            }}
          />
        </div>

        {belowThreshold && !approvalRequested && (
          <div className="mt-3 space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-900">
              This amount ({formatRupees(parsedAmount)}) is below the required {MINIMUM_ADVANCE_PERCENT}% of
              the order total ({formatRupees(requiredAdvance)}).
            </p>
            <p className="text-xs text-muted-foreground">
              Continuing will email Santosh Kumar Chegondi and Amarpal Gampa an approval link — the
              advance is recorded automatically once one of them approves it.
            </p>
          </div>
        )}

        {approvalRequested ? (
          <p className="mt-2 text-sm text-amber-900">{error}</p>
        ) : (
          error && <p className="mt-2 text-sm text-destructive">{error}</p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {approvalRequested ? "Close" : "Cancel"}
          </Button>
          {!approvalRequested && (
            <Button type="button" onClick={handleConfirm} disabled={submitting}>
              {submitting && <Spinner className="mr-2 h-4 w-4" />}
              {submitting ? "Saving..." : "Save"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
