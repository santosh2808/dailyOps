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
import { STATUS_OPTIONS } from "./jeoOptions";
import type { JeoStatus, JobExecutionOrder } from "@/types";

interface ChangeJeoStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jeo: JobExecutionOrder | null;
  onConfirm: (status: JeoStatus) => Promise<void>;
}

// Full manual control over all six statuses, same "Change Status" dialog
// pattern used by every other module. The three quick-action buttons on
// JobExecutionOrderDetails (Start Production / Mark QC Complete / Ready For
// Dispatch) are convenience shortcuts layered on top of this — this dialog
// is what reaches COMPLETED, since that's not one of the named buttons in
// scope.
export default function ChangeJeoStatusDialog({
  open,
  onOpenChange,
  jeo,
  onConfirm,
}: ChangeJeoStatusDialogProps) {
  const [status, setStatus] = useState<JeoStatus>("PENDING");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && jeo) {
      setStatus(jeo.status);
      setError("");
    }
  }, [open, jeo]);

  async function handleConfirm() {
    setSubmitting(true);
    setError("");
    try {
      await onConfirm(status);
      onOpenChange(false);
    } catch {
      setError("Could not update the JEO status. Please try again.");
      toast.error("Could not update the JEO status.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!jeo) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Change JEO Status</DialogTitle>
          <DialogDescription>
            Update the status for <span className="font-medium text-slate-900">{jeo.jeoNumber}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="jeo-status">Status</Label>
          <Select
            id="jeo-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as JeoStatus)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>

        {status === "COMPLETED" && (
          <p className="mt-2 text-xs text-muted-foreground">
            Marking this JEO Completed also records the completion time on its Production Checklist.
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
