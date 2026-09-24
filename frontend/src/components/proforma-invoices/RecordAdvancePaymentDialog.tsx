import { useEffect, useState } from "react";
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
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/errors";
import { DISPATCH_OVERRIDE_APPROVERS, type ProformaInvoice } from "@/types";

interface RecordAdvancePaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: ProformaInvoice | null;
  // Linked Sales Order's grandTotal — the minimum advance is
  // MINIMUM_ADVANCE_PERCENT% of this. Passed in from SalesOrderDetails.tsx,
  // which already has it in scope.
  salesOrderGrandTotal: number;
  // Whether the acting user holds the Administrator role — only an Admin
  // may record a below-minimum advance override (see
  // ProformaInvoicesService.updateAdvance()). This only drives which UI is
  // shown; the backend enforces it for real.
  isAdmin: boolean;
  onConfirm: (advanceReceived: number, overrideApprovedBy?: string, overrideNote?: string) => Promise<void>;
}

// QA feature (SC-011): Record Advance Payment now enforces a minimum — 50%
// of the linked Sales Order's grandTotal (MINIMUM_ADVANCE_PERCENT, same
// threshold as the dispatch gate). Below that, only an Administrator can
// save anyway, and only by recording that one of the two fixed named
// approvers (Santosh Kumar Chegondi / Amarpal Gampa) authorized it — mirrors
// ChangeSalesOrderStatusDialog.tsx's dispatch override UI exactly.
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
  isAdmin,
  onConfirm,
}: RecordAdvancePaymentDialogProps) {
  const [amount, setAmount] = useState("");
  const [overrideApprovedBy, setOverrideApprovedBy] = useState("");
  const [overrideNote, setOverrideNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && invoice) {
      setAmount(String(invoice.advanceReceived ?? 0));
      setOverrideApprovedBy("");
      setOverrideNote("");
      setError("");
    }
  }, [open, invoice]);

  const requiredAdvance = salesOrderGrandTotal > 0 ? (salesOrderGrandTotal * MINIMUM_ADVANCE_PERCENT) / 100 : 0;
  const parsedAmount = Number(amount);
  const validAmount = amount.trim() !== "" && !Number.isNaN(parsedAmount) && parsedAmount >= 0;
  const belowThreshold = validAmount && parsedAmount < requiredAdvance;
  const canSubmit = validAmount && (!belowThreshold || (isAdmin && !!overrideApprovedBy));

  async function handleConfirm() {
    setError("");
    if (!validAmount) {
      setError("Enter a valid, non-negative amount.");
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(
        parsedAmount,
        belowThreshold ? overrideApprovedBy || undefined : undefined,
        belowThreshold ? overrideNote.trim() || undefined : undefined,
      );
      onOpenChange(false);
    } catch (err) {
      const message = getErrorMessage(err, "Could not record the advance payment. Please try again.");
      setError(message);
      toast.error(message);
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
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        {belowThreshold && !isAdmin && (
          <div className="mt-3 space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-sm font-medium text-destructive">
              This amount ({formatRupees(parsedAmount)}) is below the required {MINIMUM_ADVANCE_PERCENT}% of
              the order total ({formatRupees(requiredAdvance)}).
            </p>
            <p className="text-xs text-muted-foreground">
              Only an Administrator can save a below-minimum advance, and only with authorization from
              Santosh Kumar Chegondi or Amarpal Gampa.
            </p>
          </div>
        )}

        {belowThreshold && isAdmin && (
          <div className="mt-3 space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-900">
              This amount ({formatRupees(parsedAmount)}) is below the required {MINIMUM_ADVANCE_PERCENT}% of
              the order total ({formatRupees(requiredAdvance)}).
            </p>
            <div className="space-y-2">
              <Label htmlFor="advance-override-approved-by">Approved By (required)</Label>
              <Select
                id="advance-override-approved-by"
                value={overrideApprovedBy}
                onChange={(e) => setOverrideApprovedBy(e.target.value)}
              >
                <option value="">Select...</option>
                {DISPATCH_OVERRIDE_APPROVERS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="advance-override-note">Note (optional)</Label>
              <Textarea
                id="advance-override-note"
                placeholder="e.g. Customer will pay the balance on delivery — accepted per Sales Manager approval."
                value={overrideNote}
                onChange={(e) => setOverrideNote(e.target.value)}
              />
            </div>
          </div>
        )}

        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={submitting || !canSubmit}>
            {submitting && <Spinner className="mr-2 h-4 w-4" />}
            {submitting ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
