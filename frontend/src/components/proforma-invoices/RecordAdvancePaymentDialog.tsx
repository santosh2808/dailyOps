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
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import type { ProformaInvoice } from "@/types";

interface RecordAdvancePaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: ProformaInvoice | null;
  onConfirm: (advanceReceived: number) => Promise<void>;
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
  onConfirm,
}: RecordAdvancePaymentDialogProps) {
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && invoice) {
      setAmount(String(invoice.advanceReceived ?? 0));
      setError("");
    }
  }, [open, invoice]);

  async function handleConfirm() {
    setError("");
    const value = Number(amount);
    if (amount.trim() === "" || Number.isNaN(value) || value < 0) {
      setError("Enter a valid, non-negative amount.");
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(value);
      onOpenChange(false);
    } catch {
      setError("Could not record the advance payment. Please try again.");
      toast.error("Could not record the advance payment.");
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
          <Button type="button" onClick={handleConfirm} disabled={submitting}>
            {submitting && <Spinner className="mr-2 h-4 w-4" />}
            {submitting ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
