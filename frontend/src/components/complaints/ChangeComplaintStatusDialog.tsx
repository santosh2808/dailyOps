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
import { STATUS_OPTIONS } from "./complaintOptions";
import type { Complaint, ComplaintStatus } from "@/types";

interface ChangeComplaintStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  complaint: Complaint | null;
  onConfirm: (status: ComplaintStatus, resolutionNotes?: string) => Promise<void>;
}

export default function ChangeComplaintStatusDialog({
  open,
  onOpenChange,
  complaint,
  onConfirm,
}: ChangeComplaintStatusDialogProps) {
  const [status, setStatus] = useState<ComplaintStatus>("OPEN");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && complaint) {
      setStatus(complaint.status);
      setResolutionNotes(complaint.resolutionNotes ?? "");
      setError("");
    }
  }, [open, complaint]);

  const isResolving = status === "RESOLVED" || status === "CLOSED";

  async function handleConfirm() {
    setSubmitting(true);
    setError("");
    try {
      await onConfirm(status, resolutionNotes.trim() || undefined);
      onOpenChange(false);
    } catch {
      setError("Could not update the complaint status. Please try again.");
      toast.error("Could not update the complaint status.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!complaint) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Change Complaint Status</DialogTitle>
          <DialogDescription>
            Update the status for{" "}
            <span className="font-medium text-slate-900">{complaint.complaintNumber}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="complaint-status">Status</Label>
            <Select
              id="complaint-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ComplaintStatus)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>

          {isResolving && (
            <div className="space-y-2">
              <Label htmlFor="resolution-notes">Resolution Notes</Label>
              <Textarea
                id="resolution-notes"
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="What was done to resolve this complaint?"
              />
            </div>
          )}
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
            {submitting ? "Updating..." : "Update Status"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
