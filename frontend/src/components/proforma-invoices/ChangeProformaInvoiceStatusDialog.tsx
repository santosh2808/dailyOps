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
import { STATUS_OPTIONS } from "./proformaInvoiceOptions";
import type { ProformaInvoice, ProformaInvoiceStatus } from "@/types";

interface ChangeProformaInvoiceStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: ProformaInvoice | null;
  onConfirm: (status: ProformaInvoiceStatus) => Promise<void>;
}

export default function ChangeProformaInvoiceStatusDialog({
  open,
  onOpenChange,
  invoice,
  onConfirm,
}: ChangeProformaInvoiceStatusDialogProps) {
  const [status, setStatus] = useState<ProformaInvoiceStatus>("DRAFT");
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
    } finally {
      setSubmitting(false);
    }
  }

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Change Invoice Status</DialogTitle>
          <DialogDescription>
            Update the status for{" "}
            <span className="font-medium text-slate-900">{invoice.invoiceNumber}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="invoice-status">Status</Label>
          <Select
            id="invoice-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as ProformaInvoiceStatus)}
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
            Cancelling this invoice will allow a new Proforma Invoice to be generated for the same
            Sales Order.
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
            {submitting ? "Updating..." : "Update Status"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
