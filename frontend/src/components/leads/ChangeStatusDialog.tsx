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
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { STATUS_OPTIONS } from "./leadOptions";
import type { Lead, LeadStatus } from "@/types";

interface ChangeStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
  onConfirm: (status: LeadStatus, remarks?: string) => Promise<void>;
}

export default function ChangeStatusDialog({
  open,
  onOpenChange,
  lead,
  onConfirm,
}: ChangeStatusDialogProps) {
  const [status, setStatus] = useState<LeadStatus>("NEW");
  // Additive: recorded on Lead Status History (and the History timeline)
  // alongside this change — entirely optional, existing callers/tests that
  // never touch this field are unaffected.
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && lead) {
      setStatus(lead.status);
      setRemarks("");
      setError("");
    }
  }, [open, lead]);

  async function handleConfirm() {
    setSubmitting(true);
    setError("");
    try {
      await onConfirm(status, remarks.trim() || undefined);
      onOpenChange(false);
    } catch {
      setError("Could not update the lead status. Please try again.");
      toast.error("Could not update the lead status.");
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

        <div className="mt-4 space-y-2">
          <Label htmlFor="lead-status-remarks">Remarks (optional)</Label>
          <Textarea
            id="lead-status-remarks"
            placeholder="Add a note about this status change..."
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
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
            {submitting && <Spinner className="mr-2 h-4 w-4" />}
            {submitting ? "Updating..." : "Update Status"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
