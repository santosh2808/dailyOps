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
import { STATUS_OPTIONS } from "./quotationOptions";
import type { Quotation, QuotationStatus } from "@/types";

interface ChangeQuotationStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quotation: Quotation | null;
  onConfirm: (status: QuotationStatus) => Promise<void>;
}

export default function ChangeQuotationStatusDialog({
  open,
  onOpenChange,
  quotation,
  onConfirm,
}: ChangeQuotationStatusDialogProps) {
  const [status, setStatus] = useState<QuotationStatus>("DRAFT");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && quotation) {
      setStatus(quotation.status);
      setError("");
    }
  }, [open, quotation]);

  async function handleConfirm() {
    setSubmitting(true);
    setError("");
    try {
      await onConfirm(status);
      onOpenChange(false);
    } catch {
      setError("Could not update the quotation status. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!quotation) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Change Quotation Status</DialogTitle>
          <DialogDescription>
            Update the status for{" "}
            <span className="font-medium text-slate-900">{quotation.quotationNumber}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="quotation-status">Status</Label>
          <Select
            id="quotation-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as QuotationStatus)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
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
            {submitting ? "Updating..." : "Update Status"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
