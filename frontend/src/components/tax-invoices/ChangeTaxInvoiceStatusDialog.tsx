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
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { STATUS_OPTIONS } from "./taxInvoiceOptions";
import type { TaxInvoice, TaxInvoiceStatus } from "@/types";

interface ChangeTaxInvoiceStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: TaxInvoice | null;
  onConfirm: (status: TaxInvoiceStatus) => Promise<void>;
}

export default function ChangeTaxInvoiceStatusDialog({
  open,
  onOpenChange,
  invoice,
  onConfirm,
}: ChangeTaxInvoiceStatusDialogProps) {
  const [status, setStatus] = useState<TaxInvoiceStatus>("DRAFT");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && invoice) {
      setStatus(invoice.status);
      setError("");
    }
  }, [open, invoice]);

  async function handleConfirm() {
    setSubmitting(true);
    setError("");
    try {
      await onConfirm(status);
      onOpenChange(false);
    } catch {
      setError("Could not update the invoice status. Please try again.");
      toast.error("Could not update the invoice status.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Change Tax Invoice Status</DialogTitle>
          <DialogDescription>
            Update the status for{" "}
            <span className="font-medium text-slate-900">{invoice.invoiceNumber}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="tax-invoice-status">Status</Label>
          <Select
            id="tax-invoice-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as TaxInvoiceStatus)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>

        {status === "CANCELLED" && (
          <p className="mt-2 text-xs text-muted-foreground">
            Cancelling this invoice will allow a new Tax Invoice to be generated for the same Sales
            Order.
          </p>
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
          <Button type="button" onClick={handleConfirm} disabled={submitting}>
            {submitting && <Spinner className="mr-2 h-4 w-4" />}
            {submitting ? "Updating..." : "Update Status"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
