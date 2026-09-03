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
import { sendJeoFactoryNotification, type SendJeoResult } from "@/api/job-execution-orders";
import type { JobExecutionOrder } from "@/types";

// Review-then-send flow, same pattern as SendTaxInvoiceDialog. The factory
// notification used to be a one-shot automatic email at generation time —
// this is the explicit step, reachable any time, to (re)send it. Unlike the
// customer-facing sends, this defaults to the internal Production Team
// address (FACTORY_NOTIFICATION_EMAIL) rather than a customer email.

interface SendJeoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jeo: JobExecutionOrder | null;
  onSent: (result: SendJeoResult) => void;
}

export default function SendJeoDialog({ open, onOpenChange, jeo, onSent }: SendJeoDialogProps) {
  const [recipientEmail, setRecipientEmail] = useState("");
  const [ccEmails, setCcEmails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && jeo) {
      setRecipientEmail("");
      setCcEmails("");
      setError("");
    }
  }, [open, jeo]);

  async function handleConfirm() {
    if (!jeo) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await sendJeoFactoryNotification(jeo.id, {
        recipientEmail: recipientEmail.trim() || undefined,
        ccEmails: ccEmails.trim() || undefined,
      });
      toast.success("Factory notification resent.");
      onSent(result);
      onOpenChange(false);
    } catch (err: any) {
      const message =
        err?.response?.data?.message || "Could not send the factory notification. Please try again.";
      setError(Array.isArray(message) ? message.join(" ") : message);
      toast.error(Array.isArray(message) ? message.join(" ") : message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!jeo) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Resend to Factory</DialogTitle>
          <DialogDescription>
            Email <span className="font-medium text-slate-900">{jeo.jeoNumber}</span> to the
            Production Team as a PDF attachment. Leave the recipient blank to use the default
            factory notification address.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="jeo-recipient-email">Recipient Email (optional)</Label>
            <Input
              id="jeo-recipient-email"
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="Defaults to the factory notification address"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="jeo-cc-emails">CC (comma-separated, optional)</Label>
            <Input
              id="jeo-cc-emails"
              value={ccEmails}
              onChange={(e) => setCcEmails(e.target.value)}
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
            {submitting ? "Sending..." : "Resend to Factory"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
