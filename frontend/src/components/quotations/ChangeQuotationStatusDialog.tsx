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
        setError(
          body?.message ||
            "Could not update the quotation status. Please try again.",
        );
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
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          "Could not submit the approval request. Please try again.",
      );
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
  const statusOptions = quotation.customerId
    ? STATUS_OPTIONS
    : STATUS_OPTIONS.filter((s) => s.value !== "ACCEPTED");

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
                {requestingApproval ? "Submitting..." : "Request Approval"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
