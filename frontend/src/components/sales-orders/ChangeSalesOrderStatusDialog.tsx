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
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { STATUS_OPTIONS } from "./salesOrderOptions";
import { DISPATCH_OVERRIDE_APPROVERS, type SalesOrder, type SalesOrderStatus } from "@/types";

interface ChangeSalesOrderStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salesOrder: SalesOrder | null;
  // Current advance received on the active Proforma Invoice (0 if none) —
  // passed in from SalesOrderDetails.tsx so the 50% threshold can be
  // checked proactively instead of only reacting to a backend rejection.
  advanceReceived: number;
  // Whether the acting user holds the Administrator role — only an Admin
  // may record a dispatch override (see SalesOrdersService.updateStatus()).
  // This only drives which UI is shown; the backend enforces it for real.
  isAdmin: boolean;
  onConfirm: (
    status: SalesOrderStatus,
    dispatchOverrideNote?: string,
    dispatchOverrideApprovedBy?: string,
  ) => Promise<void>;
}

// Dispatch gate: moving to READY_FOR_DISPATCH or DISPATCHED is blocked
// server-side unless at least 50% of the order total has been received as
// advance against the linked Proforma Invoice (see
// SalesOrdersService.updateStatus()). Below that, only an Administrator can
// dispatch anyway, and only by recording that one of the two fixed named
// approvers (Santosh Kumar Chegondi / Amarpal Gampa) authorized it.
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
  isAdmin,
  onConfirm,
}: ChangeSalesOrderStatusDialogProps) {
  const [status, setStatus] = useState<SalesOrderStatus>("DRAFT");
  const [overrideNote, setOverrideNote] = useState("");
  const [overrideApprovedBy, setOverrideApprovedBy] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (open && salesOrder) {
      setStatus(salesOrder.status);
      setOverrideNote("");
      setOverrideApprovedBy("");
      setError("");
      setBlocked(false);
    }
  }, [open, salesOrder]);

  const showDispatchGate = DISPATCH_GATE_STATUSES.includes(status);
  const grandTotal = salesOrder?.grandTotal ?? 0;
  const requiredAdvance = grandTotal > 0 ? (grandTotal * DISPATCH_ADVANCE_THRESHOLD_PERCENT) / 100 : 0;
  const belowThreshold = showDispatchGate && advanceReceived < requiredAdvance;
  const canSubmit = !belowThreshold || (isAdmin && !!overrideApprovedBy);

  async function handleConfirm() {
    setSubmitting(true);
    setError("");
    try {
      await onConfirm(
        status,
        overrideNote.trim() || undefined,
        belowThreshold ? overrideApprovedBy || undefined : undefined,
      );
      onOpenChange(false);
    } catch (err: any) {
      const message =
        err?.response?.data?.message || "Could not update the sales order status. Please try again.";
      setError(message);
      // The advance-payment block is the one error worth reacting to in the
      // UI (highlight the override fields); anything else is just shown.
      setBlocked(showDispatchGate);
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
              setBlocked(false);
              setError("");
            }}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>

        {belowThreshold && !isAdmin && (
          <div className="mt-3 space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-sm font-medium text-destructive">
              Advance received ({formatRupees(advanceReceived)}) is below the required{" "}
              {DISPATCH_ADVANCE_THRESHOLD_PERCENT}% of the order total ({formatRupees(requiredAdvance)}).
            </p>
            <p className="text-xs text-muted-foreground">
              Only an Administrator can dispatch this order below the threshold, and only with
              authorization from Santosh Kumar Chegondi or Amarpal Gampa.
            </p>
          </div>
        )}

        {belowThreshold && isAdmin && (
          <div className="mt-3 space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-900">
              Advance received ({formatRupees(advanceReceived)}) is below the required{" "}
              {DISPATCH_ADVANCE_THRESHOLD_PERCENT}% of the order total ({formatRupees(requiredAdvance)}).
            </p>
            <div className="space-y-2">
              <Label htmlFor="dispatch-override-approved-by">Approved By (required)</Label>
              <Select
                id="dispatch-override-approved-by"
                value={overrideApprovedBy}
                onChange={(e) => setOverrideApprovedBy(e.target.value)}
              >
                <option value="">Select...</option>
                {DISPATCH_OVERRIDE_APPROVERS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dispatch-override-note">Note (optional)</Label>
              <Textarea
                id="dispatch-override-note"
                placeholder="e.g. Customer confirmed payment on delivery — dispatching per approval."
                value={overrideNote}
                onChange={(e) => setOverrideNote(e.target.value)}
              />
            </div>
          </div>
        )}

        {blocked && (
          <p className="mt-2 text-xs text-muted-foreground">
            Leave the note blank if the advance has already been recorded — it's only needed alongside
            an approver when overriding the block.
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
          <Button type="button" onClick={handleConfirm} disabled={submitting || !canSubmit}>
            {submitting && <Spinner className="mr-2 h-4 w-4" />}
            {submitting ? "Updating..." : "Update Status"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
