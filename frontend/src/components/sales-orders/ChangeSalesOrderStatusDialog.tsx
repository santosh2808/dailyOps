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
import { STATUS_OPTIONS } from "./salesOrderOptions";
import type { SalesOrder, SalesOrderStatus } from "@/types";

interface ChangeSalesOrderStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salesOrder: SalesOrder | null;
  onConfirm: (status: SalesOrderStatus) => Promise<void>;
}

export default function ChangeSalesOrderStatusDialog({
  open,
  onOpenChange,
  salesOrder,
  onConfirm,
}: ChangeSalesOrderStatusDialogProps) {
  const [status, setStatus] = useState<SalesOrderStatus>("DRAFT");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && salesOrder) {
      setStatus(salesOrder.status);
      setError("");
    }
  }, [open, salesOrder]);

  async function handleConfirm() {
    setSubmitting(true);
    setError("");
    try {
      await onConfirm(status);
      onOpenChange(false);
    } catch {
      setError("Could not update the sales order status. Please try again.");
      toast.error("Could not update the sales order status.");
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
            onChange={(e) => setStatus(e.target.value as SalesOrderStatus)}
          >
            {STATUS_OPTIONS.map((s) => (
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
            {submitting && <Spinner className="mr-2 h-4 w-4" />}
            {submitting ? "Updating..." : "Update Status"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
