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
import { todayDateInputValue, isPastDateInputValue } from "@/lib/date";
import type { Lead } from "@/types";

interface ScheduleFollowUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
  onConfirm: (nextFollowUp: string, reminderNote?: string) => Promise<void>;
}

// UX fix: a Contacted lead's next-action button reads "Schedule Follow-up",
// but clicking it used to just open the generic Change Status dropdown —
// which has no date field at all, so the label's promise went unfulfilled.
// This is a purpose-built replacement: date + optional reminder note, no
// status field, since scheduling a follow-up on an already-Contacted lead
// doesn't move its stage on its own (that happens separately once a Site
// Visit actually occurs — see leadOptions.ts's CONTACTED hint).
// LeadsService.update() already writes its own dedicated "Follow-up
// scheduled for ..." Timeline entry whenever nextFollowUp/reminderNote
// change, so this dialog doesn't need to log anything itself.
export default function ScheduleFollowUpDialog({
  open,
  onOpenChange,
  lead,
  onConfirm,
}: ScheduleFollowUpDialogProps) {
  const [nextFollowUp, setNextFollowUp] = useState("");
  const [reminderNote, setReminderNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && lead) {
      setNextFollowUp(lead.nextFollowUp ? lead.nextFollowUp.slice(0, 10) : "");
      setReminderNote(lead.reminderNote ?? "");
      setError("");
    }
  }, [open, lead]);

  async function handleConfirm() {
    setError("");
    if (!nextFollowUp) {
      setError("Pick a Next Follow-up date.");
      return;
    }
    if (isPastDateInputValue(nextFollowUp)) {
      setError("Next Follow-up cannot be before today");
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(nextFollowUp, reminderNote.trim() || undefined);
      onOpenChange(false);
    } catch {
      setError("Could not schedule this follow-up. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!lead) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Schedule Follow-up</DialogTitle>
          <DialogDescription>
            When should someone follow up with{" "}
            <span className="font-medium text-slate-900">{lead.contactPerson}</span> —{" "}
            {lead.leadNumber}?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="schedule-followup-date">Next Follow-up *</Label>
          <Input
            id="schedule-followup-date"
            type="date"
            min={todayDateInputValue()}
            value={nextFollowUp}
            onChange={(e) => setNextFollowUp(e.target.value)}
          />
        </div>

        <div className="mt-4 space-y-2">
          <Label htmlFor="schedule-followup-note">Reminder (optional)</Label>
          <Input
            id="schedule-followup-note"
            placeholder="e.g. Call before 3pm"
            value={reminderNote}
            onChange={(e) => setReminderNote(e.target.value)}
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
            {submitting ? "Saving..." : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
