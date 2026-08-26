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
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { sendQuotation, type SendQuotationResult } from "@/api/quotations";
import type { Quotation } from "@/types";

// Requirement #6 — "Send Quotation" button: generates the PDF, sends the
// email, records Email History, and sets status=Sent (all server-side in
// QuotationsService.sendQuotation()). The recipient defaults to the
// customer's email on file but can be overridden here, and CC recipients
// can be added freely (comma-separated).

interface SendQuotationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quotation: Quotation | null;
  onSent: (result: SendQuotationResult) => void;
}

export default function SendQuotationDialog({
  open,
  onOpenChange,
  quotation,
  onSent,
}: SendQuotationDialogProps) {
  const [recipientEmail, setRecipientEmail] = useState("");
  const [ccEmails, setCcEmails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && quotation) {
      // Lead Management Phase 1: lead-sourced quotations have no Customer
      // yet — fall back to the Lead's own email on file.
      setRecipientEmail(quotation.customer?.email || quotation.lead?.email || "");
      setCcEmails("");
      setError("");
    }
  }, [open, quotation]);

  async function handleConfirm() {
    if (!quotation) return;
    if (!recipientEmail.trim()) {
      setError("A recipient email address is required.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const result = await sendQuotation(quotation.id, {
        recipientEmail: recipientEmail.trim(),
        ccEmails: ccEmails.trim() || undefined,
      });
      toast.success("Quotation sent.");
      onSent(result);
      onOpenChange(false);
    } catch (err: any) {
      const message =
        err?.response?.data?.message || "Could not send the quotation. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!quotation) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Send Quotation</DialogTitle>
          <DialogDescription>
            Email{" "}
            <span className="font-medium text-slate-900">{quotation.quotationNumber}</span> to
            the customer as a PDF attachment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="recipient-email">Recipient Email</Label>
            <Input
              id="recipient-email"
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="customer@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cc-emails">CC (comma-separated, optional)</Label>
            <Input
              id="cc-emails"
              value={ccEmails}
              onChange={(e) => setCcEmails(e.target.value)}
              placeholder="sales.manager@company.com"
            />
          </div>
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
            {submitting ? "Sending..." : "Send Quotation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
