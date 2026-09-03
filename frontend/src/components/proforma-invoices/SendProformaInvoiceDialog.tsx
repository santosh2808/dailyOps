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
import { sendProformaInvoice, type SendProformaInvoiceResult } from "@/api/proforma-invoices";
import type { ProformaInvoice } from "@/types";

// Review-then-send flow, same pattern as SendTaxInvoiceDialog: generating a
// Proforma Invoice used to auto-email immediately with no way to fix a
// mistake — this is now the explicit step, reachable any time, that emails
// (or resends to) the customer. Also handles "Resend" once already SENT.

interface SendProformaInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: ProformaInvoice | null;
  onSent: (result: SendProformaInvoiceResult) => void;
}

export default function SendProformaInvoiceDialog({
  open,
  onOpenChange,
  invoice,
  onSent,
}: SendProformaInvoiceDialogProps) {
  const [recipientEmail, setRecipientEmail] = useState("");
  const [ccEmails, setCcEmails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const isResend = invoice?.status === "SENT";

  useEffect(() => {
    if (open && invoice) {
      setRecipientEmail(invoice.customer?.email || "");
      setCcEmails("");
      setError("");
    }
  }, [open, invoice]);

  async function handleConfirm() {
    if (!invoice) return;
    if (!recipientEmail.trim()) {
      setError("A recipient email address is required.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const result = await sendProformaInvoice(invoice.id, {
        recipientEmail: recipientEmail.trim(),
        ccEmails: ccEmails.trim() || undefined,
      });
      toast.success(isResend ? "Proforma Invoice resent." : "Proforma Invoice sent.");
      onSent(result);
      onOpenChange(false);
    } catch (err: any) {
      const message =
        err?.response?.data?.message || "Could not send the Proforma Invoice. Please try again.";
      setError(Array.isArray(message) ? message.join(" ") : message);
      toast.error(Array.isArray(message) ? message.join(" ") : message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>{isResend ? "Resend Proforma Invoice" : "Send Proforma Invoice"}</DialogTitle>
          <DialogDescription>
            Email <span className="font-medium text-slate-900">{invoice.invoiceNumber}</span> to
            the customer as a PDF attachment. Review the recipient below before sending — use
            "View PDF" first if you'd like to check the document itself.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="pi-recipient-email">Recipient Email</Label>
            <Input
              id="pi-recipient-email"
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="customer@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pi-cc-emails">CC (comma-separated, optional)</Label>
            <Input
              id="pi-cc-emails"
              value={ccEmails}
              onChange={(e) => setCcEmails(e.target.value)}
              placeholder="finance@smartrotamac.com"
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
            {submitting ? "Sending..." : isResend ? "Resend Proforma Invoice" : "Send Proforma Invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
