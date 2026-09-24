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
import { getErrorMessage } from "@/lib/errors";
import { sendSalesOrder, type SendSalesOrderResult } from "@/api/sales-orders";
import type { SalesOrder } from "@/types";

// QA bug fix (SC-007): "Updated Sales Order not sent to customer after
// editing" — Sales Orders only ever emailed the customer once, automatically,
// at creation. This is the explicit action staff use to notify the customer
// any time after that — same review-then-send pattern as
// SendProformaInvoiceDialog/SendTaxInvoiceDialog. Note (SC-009): a Sales
// Order is only editable while still a Draft, so in practice this is used
// right after finishing edits and moving it to Confirmed (or later), or
// simply to resend/redirect an already-confirmed order — not mid-edit.

interface SendSalesOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salesOrder: SalesOrder | null;
  onSent: (result: SendSalesOrderResult) => void;
}

export default function SendSalesOrderDialog({
  open,
  onOpenChange,
  salesOrder,
  onSent,
}: SendSalesOrderDialogProps) {
  const [recipientEmail, setRecipientEmail] = useState("");
  const [ccEmails, setCcEmails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && salesOrder) {
      setRecipientEmail(salesOrder.customer?.email || "");
      setCcEmails("");
      setError("");
    }
  }, [open, salesOrder]);

  async function handleConfirm() {
    if (!salesOrder) return;
    if (!recipientEmail.trim()) {
      setError("A recipient email address is required.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const result = await sendSalesOrder(salesOrder.id, {
        recipientEmail: recipientEmail.trim(),
        ccEmails: ccEmails.trim() || undefined,
      });
      toast.success("Sales Order sent to the customer.");
      onSent(result);
      onOpenChange(false);
    } catch (err) {
      const message = getErrorMessage(err, "Could not send the Sales Order. Please try again.");
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!salesOrder) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Send Sales Order to Customer</DialogTitle>
          <DialogDescription>
            Email <span className="font-medium text-slate-900">{salesOrder.salesOrderNumber}</span>{" "}
            to the customer with its current details — use this any time they need to see (or be
            reminded of) the confirmed order.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="so-recipient-email">Recipient Email</Label>
            <Input
              id="so-recipient-email"
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="customer@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="so-cc-emails">CC (comma-separated, optional)</Label>
            <Input
              id="so-cc-emails"
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
            {submitting ? "Sending..." : "Send Sales Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
