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
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";

// Customer Quotation Acceptance workflow, requirement #5 — reason radio
// buttons plus a Comments field, submitted via "Submit Rejection". Reason
// values match REJECTION_REASONS in backend/src/quotations/dto/reject-
// public-quotation.dto.ts exactly (kept as a plain local array rather than
// importing across the frontend/backend boundary, same as every other
// enum-like option list in this frontend — e.g. quotationOptions.ts).
const REJECTION_REASONS = [
  "Price is high",
  "Requirements changed",
  "Project postponed",
  "Selected another supplier",
  "Other",
];

interface RejectQuotationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quotationNumber: string;
  onConfirm: (payload: { reason: string; comment?: string }) => Promise<void>;
}

export default function RejectQuotationDialog({
  open,
  onOpenChange,
  quotationNumber,
  onConfirm,
}: RejectQuotationDialogProps) {
  const [reason, setReason] = useState(REJECTION_REASONS[0]);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setReason(REJECTION_REASONS[0]);
      setComment("");
      setError("");
    }
  }, [open]);

  async function handleSubmit() {
    setSubmitting(true);
    setError("");
    try {
      await onConfirm({ reason, comment: comment.trim() || undefined });
    } catch (err: any) {
      setError(
        err?.response?.data?.message || "Could not record your rejection. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Reject Quotation {quotationNumber}?</DialogTitle>
          <DialogDescription>
            Let us know why so we can follow up appropriately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Reason</Label>
            <div className="space-y-2">
              {REJECTION_REASONS.map((option) => (
                <label key={option} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="rejection-reason"
                    value={option}
                    checked={reason === option}
                    onChange={() => setReason(option)}
                    className="h-4 w-4 border-input text-primary focus-visible:outline-none"
                  />
                  {option}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reject-comment">Comments (optional)</Label>
            <Textarea
              id="reject-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Tell us more..."
              maxLength={1000}
            />
          </div>
        </div>

        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={handleSubmit} disabled={submitting}>
            {submitting && <Spinner className="mr-2 h-4 w-4" />}
            {submitting ? "Submitting..." : "Submit Rejection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
