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
import { sendTaxInvoice, type SendTaxInvoiceResult } from "@/api/tax-invoices";
import type { TaxInvoice } from "@/types";

// Review-then-send flow, same pattern as SendQuotationDialog: generating a
// Tax Invoice only creates a DRAFT (see GenerateTaxInvoiceDialog) — this is
// the explicit step that actually emails the customer, letting the
// recipient/CC be reviewed or overridden before it goes out. Also handles
// "Resend" once already SENT.

interface SendTaxInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: TaxInvoice | null;
  onSent: (result: SendTaxInvoiceResult) => void;
}

export default function SendTaxInvoiceDialog({
  open,
  onOpenChange,
  invoice,
  onSent,
}: SendTaxInvoiceDialogProps) {
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
      const result = await sendTaxInvoice(invoice.id, {
        recipientEmail: recipientEmail.trim(),
        ccEmails: ccEmails.trim() || undefined,
      });
      toast.success(isResend ? "Tax Invoice resent." : "Tax Invoice sent.");
      onSent(result);
      onOpenChange(false);
    } catch (err: any) {
      const message =
        err?.response?.data?.message || "Could not send the Tax Invoice. Please try again.";
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
          <DialogTitle>{isResend ? "Resend Tax Invoice" : "Send Tax Invoice"}</DialogTitle>
          <DialogDescription>
            Email <span className="font-medium text-slate-900">{invoice.invoiceNumber}</span> to
            the customer as a PDF attachment. Review the recipient below before sending — use
            "View PDF" first if you'd like to check the document itself.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="tax-invoice-recipient-email">Recipient Email</Label>
            <Input
              id="tax-invoice-recipient-email"
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="customer@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tax-invoice-cc-emails">CC (comma-separated, optional)</Label>
            <Input
              id="tax-invoice-cc-emails"
              value={ccEmails}
              onChange={(e) => setCcEmails(e.target.value)}
              placeholder="finance@smartrotamac.com"
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
            {submitting ? "Sending..." : isResend ? "Resend Tax Invoice" : "Send Tax Invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
