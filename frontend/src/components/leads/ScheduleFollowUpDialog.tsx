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
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { todayDateInputValue, isPastDateInputValue } from "@/lib/date";
import type { Lead } from "@/types";

interface ScheduleFollowUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
  onConfirm: (nextFollowUp: string, reminderNote?: string, markAsSiteVisit?: boolean) => Promise<void>;
}

// UX fix: a Contacted lead's next-action button reads "Schedule Follow-up",
// but clicking it used to just open the generic Change Status dropdown —
// which has no date field at all, so the label's promise went unfulfilled.
// This is a purpose-built replacement: date + optional reminder note.
// LeadsService.update() already writes its own dedicated "Follow-up
// scheduled for ..." Timeline entry whenever nextFollowUp/reminderNote
// change, so this dialog doesn't need to log anything itself.
//
// "Ideal situation to go to Site Visit step" (user's own framing): most of
// the time a Contacted lead just needs another call, but sometimes the rep
// has already locked in an on-site visit with the customer — that's a real
// pipeline-stage milestone, not just a reminder. Rather than force every
// Contacted lead through a visit (some need several calls first) or bury
// the option behind a second, easy-to-miss button, the "This is a
// scheduled Site Visit" checkbox lets the one dialog branch: checked, this
// date becomes the visit date and the status moves to Site Visit;
// unchecked, it behaves exactly as before (reminder only, no status
// change). Site Visit's own next action (Complete Site Visit ->
// SiteVisitOutcomeDialog) picks up from there once the visit has happened.
export default function ScheduleFollowUpDialog({
  open,
  onOpenChange,
  lead,
  onConfirm,
}: ScheduleFollowUpDialogProps) {
  const [nextFollowUp, setNextFollowUp] = useState("");
  const [reminderNote, setReminderNote] = useState("");
  const [markAsSiteVisit, setMarkAsSiteVisit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && lead) {
      setNextFollowUp(lead.nextFollowUp ? lead.nextFollowUp.slice(0, 10) : "");
      setReminderNote(lead.reminderNote ?? "");
      // Only offered from Contacted (see leadOptions.ts) — a lead already
      // past that stage reschedules a plain reminder here, not a fresh
      // visit, so this always starts unchecked rather than trying to infer
      // intent from the lead's current status.
      setMarkAsSiteVisit(false);
      setError("");
    }
  }, [open, lead]);

  async function handleConfirm() {
    setError("");
    if (!nextFollowUp) {
      setError(markAsSiteVisit ? "Pick a Site Visit date." : "Pick a Next Follow-up date.");
      return;
    }
    if (isPastDateInputValue(nextFollowUp)) {
      setError(`${markAsSiteVisit ? "Site Visit date" : "Next Follow-up"} cannot be before today`);
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(nextFollowUp, reminderNote.trim() || undefined, markAsSiteVisit);
      onOpenChange(false);
    } catch {
      setError(
        markAsSiteVisit
          ? "Could not schedule this site visit. Please try again."
          : "Could not schedule this follow-up. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!lead) return null;

  // Only Contacted leads offer this dialog at all (see nextActionFor), and
  // a lead already past Contacted has no "become a Site Visit" transition
  // to make — this checkbox only makes sense while it's still true.
  const canScheduleSiteVisit = lead.status === "CONTACTED";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>{markAsSiteVisit ? "Schedule Site Visit" : "Schedule Follow-up"}</DialogTitle>
          <DialogDescription>
            {markAsSiteVisit ? "When is the site visit for" : "When should someone follow up with"}{" "}
            <span className="font-medium text-slate-900">{lead.contactPerson}</span> —{" "}
            {lead.leadNumber}?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="schedule-followup-date">
            {markAsSiteVisit ? "Site Visit Date *" : "Next Follow-up *"}
          </Label>
          <Input
            id="schedule-followup-date"
            type="date"
            min={todayDateInputValue()}
            value={nextFollowUp}
            onChange={(e) => setNextFollowUp(e.target.value)}
          />
        </div>

        <div className="mt-4 space-y-2">
          <Label htmlFor="schedule-followup-note">
            {markAsSiteVisit ? "Visit notes (optional)" : "Reminder (optional)"}
          </Label>
          <Input
            id="schedule-followup-note"
            placeholder={markAsSiteVisit ? "e.g. Meet at the site office" : "e.g. Call before 3pm"}
            value={reminderNote}
            onChange={(e) => setReminderNote(e.target.value)}
          />
        </div>

        {canScheduleSiteVisit && (
          <div className="mt-4 flex items-start gap-2">
            <Checkbox
              id="schedule-followup-site-visit"
              checked={markAsSiteVisit}
              onChange={(e) => setMarkAsSiteVisit(e.target.checked)}
            />
            <Label htmlFor="schedule-followup-site-visit" className="font-normal leading-snug">
              This is a scheduled Site Visit — move this lead to the Site Visit stage.
            </Label>
          </div>
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
            {submitting ? "Saving..." : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
