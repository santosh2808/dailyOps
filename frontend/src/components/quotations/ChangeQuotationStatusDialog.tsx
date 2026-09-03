import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requestQuotationApproval, type QuotationApprovalErrorBody } from "@/api/quotations";
import { STATUS_OPTIONS } from "./quotationOptions";
import type { Quotation, QuotationStatus } from "@/types";

interface ChangeQuotationStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quotation: Quotation | null;
  onConfirm: (status: QuotationStatus) => Promise<void>;
}

function formatCurrency(value?: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

export default function ChangeQuotationStatusDialog({
  open,
  onOpenChange,
  quotation,
  onConfirm,
}: ChangeQuotationStatusDialogProps) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<QuotationStatus>("DRAFT");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Price Validation (req #8) / Approval Matrix (req #9): when
  // assertCanAccept() blocks the ACCEPTED transition, the backend returns a
  // structured 400 body instead of a plain message. When present, we show
  // the specifics (entered/minimum/difference, or the required role) plus
  // "Update Price" / "Request Approval" actions instead of a generic error.
  const [blockedBy, setBlockedBy] = useState<QuotationApprovalErrorBody | null>(null);
  const [requestReason, setRequestReason] = useState("");
  const [requestingApproval, setRequestingApproval] = useState(false);
  const [approvalRequested, setApprovalRequested] = useState(false);

  useEffect(() => {
    if (open && quotation) {
      setStatus(quotation.status);
      setError("");
      setBlockedBy(null);
      setRequestReason("");
      setApprovalRequested(false);
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

  function handleUpdatePrice() {
    if (!quotation) return;
    onOpenChange(false);
    navigate(`/quotations/${quotation.id}/edit`);
  }

  async function handleRequestApproval() {
    if (!quotation) return;
    setRequestingApproval(true);
    setError("");
    try {
      await requestQuotationApproval(quotation.id, requestReason || undefined);
      setApprovalRequested(true);
      toast.success("Approval request submitted.");
    } catch (err: any) {
      const message =
        err?.response?.data?.message || "Could not submit the approval request. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setRequestingApproval(false);
    }
  }

  if (!quotation) return null;

  // Lead Management Phase 1 boundary (requirement #14): a lead-sourced
  // quotation (no customerId yet) can never reach ACCEPTED — the backend
  // refuses this transition outright (see QuotationsService.updateStatus()).
  // Hiding the option here means the user never sees a status they could
  // pick and then get an error back for.
  // VIEWED is a customer-triggered transition only (set automatically when
  // the customer opens the public /quote/:token link) — never offered as a
  // manual choice here.
  const statusOptions = (quotation.customerId
    ? STATUS_OPTIONS
    : STATUS_OPTIONS.filter((s) => s.value !== "ACCEPTED")
  ).filter((s) => s.value !== "VIEWED");

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
        ) : approvalRequested ? (
          <>
            <p className="text-sm text-emerald-700">
              Approval request submitted. It now appears in the Approvals inbox for the
              required approver to decide.
            </p>
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            {blockedBy.code === "PRICE_BELOW_MINIMUM" ? (
              <div className="space-y-3">
                <p className="text-sm text-destructive">{blockedBy.message}</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Entered</TableHead>
                      <TableHead>Minimum</TableHead>
                      <TableHead>Difference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blockedBy.items?.map((item) => (
                      <TableRow key={item.productId}>
                        <TableCell>{item.productName}</TableCell>
                        <TableCell>{formatCurrency(item.enteredPrice)}</TableCell>
                        <TableCell>{formatCurrency(item.minimumPrice)}</TableCell>
                        <TableCell className="text-destructive">
                          {formatCurrency(item.difference)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-destructive">{blockedBy.message}</p>
            )}

            <div className="mt-3 space-y-2">
              <Label htmlFor="approval-reason">Reason for approval (optional)</Label>
              <Textarea
                id="approval-reason"
                value={requestReason}
                onChange={(e) => setRequestReason(e.target.value)}
                placeholder="Explain why this quotation should be approved as-is..."
              />
            </div>

            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBlockedBy(null)}>
                Back
              </Button>
              {blockedBy.code === "PRICE_BELOW_MINIMUM" && (
                <Button type="button" variant="outline" onClick={handleUpdatePrice}>
                  Update Price
                </Button>
              )}
              <Button type="button" onClick={handleRequestApproval} disabled={requestingApproval}>
                {requestingApproval && <Spinner className="mr-2 h-4 w-4" />}
                {requestingApproval ? "Submitting..." : "Request Approval"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
