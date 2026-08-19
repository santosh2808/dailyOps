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
import { STATUS_OPTIONS } from "./leadOptions";
import type { Lead, LeadStatus } from "@/types";

interface ChangeStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
  onConfirm: (status: LeadStatus) => Promise<void>;
}

export default function ChangeStatusDialog({
  open,
  onOpenChange,
  lead,
  onConfirm,
}: ChangeStatusDialogProps) {
  const [status, setStatus] = useState<LeadStatus>("NEW");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && lead) {
      setStatus(lead.status);
      setError("");
    }
  }, [open, lead]);

  async function handleConfirm() {
    setSubmitting(true);
    setError("");
    try {
      await onConfirm(status);
      onOpenChange(false);
    } catch {
      setError("Could not update the lead status. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!lead) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Change Lead Status</DialogTitle>
          <DialogDescription>
            Update the pipeline stage for{" "}
            <span className="font-medium text-slate-900">{lead.leadNumber}</span> —{" "}
            {lead.companyName}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="lead-status">Status</Label>
          <Select
            id="lead-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as LeadStatus)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>

        {status === "WON" && (
          <p className="mt-2 text-xs text-muted-foreground">
            Note: marking a lead as Won does not automatically create a Customer.
            Lead-to-Customer conversion is planned for a future release.
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
