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
import type { SalesOrder, SalesOrderStatus } from "@/types";

interface ChangeSalesOrderStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salesOrder: SalesOrder | null;
  onConfirm: (status: SalesOrderStatus, dispatchOverrideNote?: string) => Promise<void>;
}

// Dispatch gate (advance-payment check): moving to READY_FOR_DISPATCH or
// DISPATCHED is blocked server-side unless some advance has been recorded
// against the linked Proforma Invoice (see SalesOrdersService.updateStatus()).
// Rather than pre-fetching the advance amount just to decide whether to show
// the override field, this dialog always offers it for these two statuses
// and only relies on it if the plain status update is rejected — the
// backend's error message explains exactly why.
const DISPATCH_GATE_STATUSES: SalesOrderStatus[] = ["READY_FOR_DISPATCH", "DISPATCHED"];

export default function ChangeSalesOrderStatusDialog({
  open,
  onOpenChange,
  salesOrder,
  onConfirm,
}: ChangeSalesOrderStatusDialogProps) {
  const [status, setStatus] = useState<SalesOrderStatus>("DRAFT");
  const [overrideNote, setOverrideNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (open && salesOrder) {
      setStatus(salesOrder.status);
      setOverrideNote("");
      setError("");
      setBlocked(false);
    }
  }, [open, salesOrder]);

  const showOverrideField = DISPATCH_GATE_STATUSES.includes(status);

  async function handleConfirm() {
    setSubmitting(true);
    setError("");
    try {
      await onConfirm(status, overrideNote.trim() || undefined);
      onOpenChange(false);
    } catch (err: any) {
      const message =
        err?.response?.data?.message || "Could not update the sales order status. Please try again.";
      setError(message);
      // The advance-payment block is the one error worth reacting to in the
      // UI (highlight the override note field); anything else is just shown.
      setBlocked(showOverrideField);
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

        {showOverrideField && (
          <div className="mt-3 space-y-2">
            <Label htmlFor="dispatch-override-note">
              Dispatch override note {blocked ? "(required)" : "(only if advance isn't received yet)"}
            </Label>
            <Textarea
              id="dispatch-override-note"
              placeholder="e.g. Customer confirmed payment on delivery — dispatching without advance per Sales Manager approval."
              value={overrideNote}
              onChange={(e) => setOverrideNote(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              This order can only move to {status === "DISPATCHED" ? "Dispatched" : "Ready for Dispatch"}{" "}
              once an advance payment is recorded on its Proforma Invoice. Leave this blank if the
              advance has already been received — it's only needed to override the block.
            </p>
          </div>
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
      </DialogContent>
    </Dialog>
  );
}
