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
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { type QuotationApprovalErrorBody } from "@/api/quotations";
import { STATUS_OPTIONS } from "./quotationOptions";
import QuotationApprovalBlockedPanel from "./QuotationApprovalBlockedPanel";
import type { Quotation, QuotationStatus } from "@/types";

interface ChangeQuotationStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quotation: Quotation | null;
  onConfirm: (status: QuotationStatus) => Promise<void>;
}

export default function ChangeQuotationStatusDialog({
  open,
  onOpenChange,
  quotation,
  onConfirm,
}: ChangeQuotationStatusDialogProps) {
  const [status, setStatus] = useState<QuotationStatus>("DRAFT");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Price Validation (req #8) / Approval Matrix (req #9): when
  // assertCanAccept() blocks the ACCEPTED transition, the backend returns a
  // structured 400 body instead of a plain message. When present, we show
  // the specifics (entered/minimum/difference, or the required role) plus
  // "Update Price" / "Request Approval" actions instead of a generic error.
  const [blockedBy, setBlockedBy] = useState<QuotationApprovalErrorBody | null>(null);

  useEffect(() => {
    if (open && quotation) {
      setStatus(quotation.status);
      setError("");
      setBlockedBy(null);
    }
  }, [open, quotation]);

  async function handleConfirm() {
    setSubmitting(true);
    setError("");
    setBlockedBy(null);
    try {
      await onConfirm(status);
      onOpenChange(false);
    } catch (err: any) {
      const body = err?.response?.data;
      if (body?.code === "PRICE_BELOW_MINIMUM" || body?.code === "APPROVAL_REQUIRED") {
        setBlockedBy(body);
      } else {
        const message =
          body?.message || "Could not update the quotation status. Please try again.";
        setError(message);
        toast.error(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!quotation) return null;

  // Bug fix: ACCEPTED used to be hidden here for a lead-sourced quotation
  // (no customerId yet) because the backend used to hard-refuse that
  // transition. It no longer does — a lead-sourced quotation can reach
  // ACCEPTED the same way the customer's own public accept link always
  // could; converting the Lead to a Customer only becomes necessary later,
  // at "Create Sales Order" time (see QuotationsService.updateStatus()).
  // VIEWED is still a customer-triggered transition only (set automatically
  // when the customer opens the public /quote/:token link) — never offered
  // as a manual choice here.
  //
  // QA fix (QC-002): DRAFT is also hidden while the quotation is REJECTED —
  // reverting a rejected quotation straight to Draft here would silently
  // erase the recorded rejection reason (see QuotationsService.updateStatus()'s
  // matching backend guard). Revising and sending an updated offer already
  // has its own dedicated "Resend Quotation" action on this page, which goes
  // straight to Sent with a fresh snapshot/link — staff should use that
  // instead of routing back through Draft.
  const statusOptions = STATUS_OPTIONS.filter(
    (s) => s.value !== "VIEWED" && !(quotation.status === "REJECTED" && s.value === "DRAFT"),
  );

  // Mirrors QuotationsService.updateStatus()'s own rule: moving to
  // DRAFT/READY/EXPIRED, or away from an already-decided ACCEPTED/REJECTED
  // status, invalidates the existing public link (and clears the prior
  // decision, if any) server-side. Shown here so staff aren't surprised by
  // it after the fact.
  const statusChangeInvalidatesLink =
    status !== quotation.status &&
    (["DRAFT", "READY", "EXPIRED"].includes(status) ||
      quotation.status === "ACCEPTED" ||
      quotation.status === "REJECTED");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Change Quotation Status</DialogTitle>
          <DialogDescription>
            Update the status for{" "}
            <span className="font-medium text-slate-900">{quotation.quotationNumber}</span>.
          </DialogDescription>
        </DialogHeader>

        {!blockedBy ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="quotation-status">Status</Label>
              <Select
                id="quotation-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as QuotationStatus)}
              >
                {statusOptions.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>

            {statusChangeInvalidatesLink && (
              <p className="mt-2 text-xs text-amber-700">
                {quotation.status === "ACCEPTED" || quotation.status === "REJECTED"
                  ? "This quotation was already decided by the customer — changing its status will clear that decision and disable its public link. Use Send Quotation afterward to issue a fresh one."
                  : "This will disable the quotation's existing public link. Use Send Quotation afterward to issue a fresh one."}
              </p>
            )}

            {quotation.status === "REJECTED" && (
              <p className="mt-2 text-xs text-slate-600">
                Want to revise the price, product, or terms and get a new decision? Use the{" "}
                <span className="font-medium">Resend Quotation</span> action on this page instead
                — it keeps the rejection on record and sends an updated offer straight to the
                customer.
              </p>
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
                {submitting ? "Updating..." : "Update Status"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <QuotationApprovalBlockedPanel
            quotationId={quotation.id}
            blockedBy={blockedBy}
            purpose="ACCEPT"
            onBack={() => setBlockedBy(null)}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
