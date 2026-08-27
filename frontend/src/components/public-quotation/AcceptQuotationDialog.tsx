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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";

// Customer Quotation Acceptance workflow, requirement #4 — "Are you sure..."
// confirmation collecting Name (required)/Designation (optional)/Comment
// (optional) plus a mandatory confirm checkbox, submitted via the "Confirm
// Acceptance" button. Kept as its own component (mirrors
// ChangeQuotationStatusDialog.tsx's convention) even though it only has one
// caller, since PublicQuotation.tsx already has enough going on rendering
// the quotation itself.
interface AcceptQuotationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quotationNumber: string;
  onConfirm: (payload: { name: string; designation?: string; comment?: string }) => Promise<void>;
}

export default function AcceptQuotationDialog({
  open,
  onOpenChange,
  quotationNumber,
  onConfirm,
}: AcceptQuotationDialogProps) {
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [comment, setComment] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setDesignation("");
      setComment("");
      setConfirmed(false);
      setError("");
    }
  }, [open]);

  async function handleSubmit() {
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (!confirmed) {
      setError("Please confirm that you have reviewed and accept this quotation.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onConfirm({
        name: name.trim(),
        designation: designation.trim() || undefined,
        comment: comment.trim() || undefined,
      });
    } catch (err: any) {
      setError(
        err?.response?.data?.message || "Could not record your acceptance. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Accept Quotation {quotationNumber}?</DialogTitle>
          <DialogDescription>
            Are you sure you want to accept this quotation? This will notify our sales team and
            cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="accept-name">Your Name *</Label>
            <Input
              id="accept-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ramesh Kumar"
              maxLength={150}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="accept-designation">Designation (optional)</Label>
            <Input
              id="accept-designation"
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              placeholder="e.g. Procurement Manager"
              maxLength={150}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="accept-comment">Comment (optional)</Label>
            <Textarea
              id="accept-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Any notes for the sales team..."
              maxLength={1000}
            />
          </div>
          <label className="flex items-start gap-2 pt-1 text-sm text-slate-700">
            <Checkbox
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5"
            />
            I confirm that I have reviewed and accept this quotation.
          </label>
        </div>

        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting && <Spinner className="mr-2 h-4 w-4" />}
            {submitting ? "Submitting..." : "Confirm Acceptance"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
