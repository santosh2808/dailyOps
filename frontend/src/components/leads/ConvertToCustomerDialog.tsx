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
import type { Lead } from "@/types";

interface ConvertToCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
  onConfirm: () => Promise<void>;
}

export default function ConvertToCustomerDialog({
  open,
  onOpenChange,
  lead,
  onConfirm,
}: ConvertToCustomerDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirm() {
    setSubmitting(true);
    setError("");
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      setError("Could not convert this lead. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!lead) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Convert to Customer</DialogTitle>
          <DialogDescription>
            This will create a new Customer for{" "}
            <span className="font-medium text-slate-900">{lead.companyName}</span> using this
            lead's company name, contact person, phone, and email, and link{" "}
            {lead.leadNumber} to that Customer. This action cannot be undone or repeated.
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

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
            {submitting ? "Converting..." : "Convert to Customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
