import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
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
import { getErrorMessage } from "@/lib/errors";
import { getValidNextStatusOptions } from "./salesOrderOptions";
import type { SalesOrder, SalesOrderStatus } from "@/types";

interface ChangeSalesOrderStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salesOrder: SalesOrder | null;
  // Current advance received on the active Proforma Invoice (0 if none) —
  // passed in from SalesOrderDetails.tsx so the 50% threshold can be shown
  // proactively instead of only reacting to a backend rejection.
  advanceReceived: number;
  onConfirm: (status: SalesOrderStatus) => Promise<void>;
}

// Dispatch gate: moving to READY_FOR_DISPATCH or DISPATCHED is blocked
// server-side unless at least 50% of the order total has been received as
// advance against the linked Proforma Invoice
// (SalesOrdersService.updateStatus()). Override Approval workflow: below
// that threshold there is no self-declare escape hatch anymore — the
// backend raises a real OverrideApprovalRequest and emails Santosh Kumar
// Chegondi / Amarpal Gampa a one-click approve/reject link; the status
// change applies automatically once one of them approves it.
const DISPATCH_GATE_STATUSES: SalesOrderStatus[] = ["READY_FOR_DISPATCH", "DISPATCHED"];
const DISPATCH_ADVANCE_THRESHOLD_PERCENT = 50;

function formatRupees(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

export default function ChangeSalesOrderStatusDialog({
  open,
  onOpenChange,
  salesOrder,
  advanceReceived,
  onConfirm,
}: ChangeSalesOrderStatusDialogProps) {
  const [status, setStatus] = useState<SalesOrderStatus>("DRAFT");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // True when the backend's 409 response means "an approval request has
  // been emailed" rather than an ordinary failure — styled as an
  // informational notice instead of a red error.
  const [approvalRequested, setApprovalRequested] = useState(false);

  useEffect(() => {
    if (open && salesOrder) {
      setStatus(salesOrder.status);
      setError("");
      setApprovalRequested(false);
    }
  }, [open, salesOrder]);

  const showDispatchGate = DISPATCH_GATE_STATUSES.includes(status);
  const grandTotal = salesOrder?.grandTotal ?? 0;
  const requiredAdvance = grandTotal > 0 ? (grandTotal * DISPATCH_ADVANCE_THRESHOLD_PERCENT) / 100 : 0;
  const belowThreshold = showDispatchGate && advanceReceived < requiredAdvance;

  async function handleConfirm() {
    setSubmitting(true);
    setError("");
    setApprovalRequested(false);
    try {
      await onConfirm(status);
      onOpenChange(false);
    } catch (err) {
      const message = getErrorMessage(err, "Could not update the sales order status. Please try again.");
      // A 409 here means the gate blocked the change and raised (or reused)
      // a real approval request — not a plain failure, so it gets its own
      // amber notice instead of toast.error's red styling.
      const isApprovalConflict = isAxiosError(err) && err.response?.status === 409;
      setError(message);
      setApprovalRequested(isApprovalConflict);
      if (isApprovalConflict) {
        toast.info(message, "Approval requested");
      } else {
        toast.error(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!salesOrder) return null;

  // QA fix: only offer statuses the backend will actually accept from this
  // order's current status (see getValidNextStatusOptions()'s own comment),
  // instead of always listing all 7 — that unfiltered list is what made
  // Draft and Confirmed look like duplicate options to QA.
  const selectableOptions = getValidNextStatusOptions(salesOrder.status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Change Sales Order Status</DialogTitle>
          <DialogDescription>
            Update the status for{" "}
            <span className="font-medium text-slate-900">{salesOrder.salesOrderNumber}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="sales-order-status">Status</Label>
          <Select
            id="sales-order-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as SalesOrderStatus);
              setError("");
              setApprovalRequested(false);
            }}
          >
            {selectableOptions.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>

        {belowThreshold && !approvalRequested && (
          <div className="mt-3 space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-900">
              Advance received ({formatRupees(advanceReceived)}) is below the required{" "}
              {DISPATCH_ADVANCE_THRESHOLD_PERCENT}% of the order total ({formatRupees(requiredAdvance)}).
            </p>
            <p className="text-xs text-muted-foreground">
              Continuing will email Santosh Kumar Chegondi and Amarpal Gampa an approval link — the
              status change applies automatically once one of them approves it.
            </p>
          </div>
        )}

        {approvalRequested ? (
          <p className="mt-2 text-sm text-amber-900">{error}</p>
        ) : (
          error && <p className="mt-2 text-sm text-destructive">{error}</p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {approvalRequested ? "Close" : "Cancel"}
          </Button>
          {!approvalRequested && (
            <Button type="button" onClick={handleConfirm} disabled={submitting}>
              {submitting && <Spinner className="mr-2 h-4 w-4" />}
              {submitting ? "Updating..." : "Update Status"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
