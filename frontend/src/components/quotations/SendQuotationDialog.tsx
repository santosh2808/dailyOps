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
import { sendQuotation, type QuotationApprovalErrorBody, type SendQuotationResult } from "@/api/quotations";
import type { Quotation } from "@/types";
import QuotationApprovalBlockedPanel from "./QuotationApprovalBlockedPanel";

// Requirement #6 — "Send Quotation" button: generates the PDF, sends the
// email, records Email History, and sets status=Sent (all server-side in
// QuotationsService.sendQuotation()). The recipient defaults to the
// customer's email on file but can be overridden here, and CC recipients
// can be added freely (comma-separated).
//
// Customer Quotation Acceptance workflow — this same dialog also handles
// "Resend Quotation" (status already SENT/VIEWED/REJECTED — REJECTED lets
// staff edit the items after a rejection and send a revised offer without a
// Change Status detour first). The backend allows re-sending anything short
// of ACCEPTED/EXPIRED (QuotationsService.sendQuotation() only blocks those
// two), and every send — first or repeat — issues a brand-new secure token,
// which invalidates any link already out in a customer's inbox, and clears
// any prior accept/reject decision. `isResend` only changes the copy shown
// here so that behavior is obvious to whoever clicks it.
//
// Pricing beyond what the sender may set (Approval Matrix / minimum price)
// is refused with the same structured 400 as accepting — the customer's
// acceptance through the link needs no further approval — and this dialog
// then offers "Request Approval" for sending.

interface SendQuotationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quotation: Quotation | null;
  onSent: (result: SendQuotationResult) => void;
  isResend?: boolean;
}

export default function SendQuotationDialog({
  open,
  onOpenChange,
  quotation,
  onSent,
  isResend = false,
}: SendQuotationDialogProps) {
  const [recipientEmail, setRecipientEmail] = useState("");
  const [ccEmails, setCcEmails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [blockedBy, setBlockedBy] = useState<QuotationApprovalErrorBody | null>(null);

  useEffect(() => {
    if (open && quotation) {
      // Lead Management Phase 1: lead-sourced quotations have no Customer
      // yet — fall back to the Lead's own email on file.
      setRecipientEmail(quotation.customer?.email || quotation.lead?.email || "");
      setCcEmails("");
      setError("");
      setBlockedBy(null);
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
      toast.success(isResend ? "Quotation resent." : "Quotation sent.");
      onSent(result);
      onOpenChange(false);
    } catch (err: any) {
      const body = err?.response?.data;
      if (body?.code === "PRICE_BELOW_MINIMUM" || body?.code === "APPROVAL_REQUIRED") {
        setBlockedBy(body);
        return;
      }
      const message = body?.message || "Could not send the quotation. Please try again.";
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
          <DialogTitle>{isResend ? "Resend Quotation" : "Send Quotation"}</DialogTitle>
          <DialogDescription>
            Email{" "}
            <span className="font-medium text-slate-900">{quotation.quotationNumber}</span> to
            the customer as a PDF attachment.
            {isResend &&
              " This issues a new secure link and PDF — any link from a previous email will stop working."}
          </DialogDescription>
        </DialogHeader>

        {blockedBy ? (
          <QuotationApprovalBlockedPanel
            quotationId={quotation.id}
            blockedBy={blockedBy}
            purpose="SEND"
            onBack={() => setBlockedBy(null)}
            onClose={() => onOpenChange(false)}
          />
        ) : (
          <>
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
                <p className="text-xs text-muted-foreground">
                  admin@smartrotamac.com, santosh.c@smartrotamac.com and amar@smartrotamac.com are
                  always CC'd automatically — no need to add them here.
                </p>
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
                {submitting ? "Sending..." : isResend ? "Resend Quotation" : "Send Quotation"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
