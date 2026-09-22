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
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { todayDateInputValue, isPastDateInputValue } from "@/lib/date";
import type { Lead } from "@/types";

export type ContactOutcome = "INTERESTED" | "NOT_INTERESTED" | "NO_RESPONSE";

const OUTCOME_OPTIONS: { value: ContactOutcome; label: string; hint: string }[] = [
  {
    value: "INTERESTED",
    label: "Reached — Interested",
    hint: "Moves this lead to Contacted.",
  },
  {
    value: "NOT_INTERESTED",
    label: "Reached — Not Interested",
    hint: "Closes this lead as Lost.",
  },
  {
    value: "NO_RESPONSE",
    label: "Could Not Reach",
    hint: "No status change — just logs the attempt.",
  },
];

interface ContactOutcomeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
  onConfirm: (outcome: ContactOutcome, note: string, nextFollowUp?: string) => Promise<void>;
}

// UX fix: "Contact Customer" used to just navigate to the Edit Lead form,
// which has no concept of "I just made this call, here's what happened" —
// logging the outcome and moving the status forward were two disconnected
// manual steps. This closes that gap: one dialog captures what happened,
// and LeadDetails.handleContactOutcomeConfirm() decides what to do with it
// (advance to Contacted, close as Lost, or just log the attempt) so the rep
// never has to separately open Change Status afterward.
export default function ContactOutcomeDialog({
  open,
  onOpenChange,
  lead,
  onConfirm,
}: ContactOutcomeDialogProps) {
  const [outcome, setOutcome] = useState<ContactOutcome>("INTERESTED");
  const [note, setNote] = useState("");
  const [nextFollowUp, setNextFollowUp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setOutcome("INTERESTED");
      setNote("");
      setNextFollowUp("");
      setError("");
    }
  }, [open]);

  async function handleConfirm() {
    setError("");
    if (isPastDateInputValue(nextFollowUp)) {
      setError("Next Follow-up cannot be before today");
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(outcome, note.trim(), nextFollowUp || undefined);
      onOpenChange(false);
    } catch {
      // onConfirm (LeadDetails) already toasts the specific error — this
      // dialog just needs to stay open so the rep doesn't lose what they
      // typed.
      setError("Could not log this outcome. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!lead) return null;

  const selected = OUTCOME_OPTIONS.find((o) => o.value === outcome);
  // A retry reminder only makes sense when the lead is still in play —
  // "Not Interested" closes it out as Lost, where Next Follow-up has no
  // meaning (TC-080 hard-blocks any further status change on a Lost lead).
  const showNextFollowUp = outcome !== "NOT_INTERESTED";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Log Contact Outcome</DialogTitle>
          <DialogDescription>
            What happened when you reached out to{" "}
            <span className="font-medium text-slate-900">{lead.contactPerson}</span> —{" "}
            {lead.leadNumber}?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="contact-outcome">Outcome</Label>
          <Select
            id="contact-outcome"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as ContactOutcome)}
          >
            {OUTCOME_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          {selected && <p className="text-xs text-muted-foreground">{selected.hint}</p>}
        </div>

        <div className="mt-4 space-y-2">
          <Label htmlFor="contact-outcome-note">
            Note {outcome === "NOT_INTERESTED" ? "(reason, optional)" : "(optional)"}
          </Label>
          <Textarea
            id="contact-outcome-note"
            placeholder="What did they say?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {showNextFollowUp && (
          <div className="mt-4 space-y-2">
            <Label htmlFor="contact-outcome-followup">Next Follow-up (optional)</Label>
            <Input
              id="contact-outcome-followup"
              type="date"
              min={todayDateInputValue()}
              value={nextFollowUp}
              onChange={(e) => setNextFollowUp(e.target.value)}
            />
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
            {submitting ? "Saving..." : "Log Outcome"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
