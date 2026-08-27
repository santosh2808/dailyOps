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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import type { TaxInvoicePayload } from "@/api/tax-invoices";
import type { SalesOrder } from "@/types";

interface GenerateTaxInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salesOrder: SalesOrder | null;
  onConfirm: (payload: Omit<TaxInvoicePayload, "salesOrderId">) => Promise<void>;
}

interface FormState {
  buyersOrderNo: string;
  dispatchedThrough: string;
  destination: string;
  termsOfDelivery: string;
}

const emptyForm: FormState = {
  buyersOrderNo: "",
  dispatchedThrough: "",
  destination: "",
  termsOfDelivery: "",
};

// Generates the final GST Tax Invoice from an existing Sales Order —
// automates what used to be typed by hand into Tally and emailed manually.
// Amounts are always copied from the Sales Order server-side; this dialog
// only collects the dispatch-specific details a Sales Order doesn't already
// have. Only reachable once an advance payment has actually been recorded
// (see SalesOrderDetails.tsx) — the backend re-checks this independently.
export default function GenerateTaxInvoiceDialog({
  open,
  onOpenChange,
  salesOrder,
  onConfirm,
}: GenerateTaxInvoiceDialogProps) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && salesOrder) {
      setForm({ ...emptyForm, destination: salesOrder.customer?.state ?? "" });
      setError("");
    }
  }, [open, salesOrder]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleConfirm() {
    setError("");
    setSubmitting(true);
    try {
      await onConfirm({
        buyersOrderNo: form.buyersOrderNo.trim() || undefined,
        dispatchedThrough: form.dispatchedThrough.trim() || undefined,
        destination: form.destination.trim() || undefined,
        termsOfDelivery: form.termsOfDelivery.trim() || undefined,
      });
      onOpenChange(false);
    } catch {
      setError("Could not generate the Tax Invoice. Please try again.");
      toast.error("Could not generate the Tax Invoice.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!salesOrder) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Generate Tax Invoice</DialogTitle>
          <DialogDescription>
            Customer and amounts will be copied automatically from{" "}
            <span className="font-medium text-slate-900">{salesOrder.salesOrderNumber}</span>. It
            will also be emailed to the customer automatically once generated.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="buyersOrderNo">Buyer's Order No.</Label>
            <Input
              id="buyersOrderNo"
              placeholder="Verbal"
              value={form.buyersOrderNo}
              onChange={(e) => update("buyersOrderNo", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dispatchedThrough">Dispatched Through</Label>
            <Input
              id="dispatchedThrough"
              placeholder="By Road"
              value={form.dispatchedThrough}
              onChange={(e) => update("dispatchedThrough", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="destination">Destination</Label>
            <Input
              id="destination"
              value={form.destination}
              onChange={(e) => update("destination", e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="termsOfDelivery">Terms of Delivery</Label>
            <Textarea
              id="termsOfDelivery"
              placeholder={"Packing: Inclusive\nInstallation: Inclusive\nFreight: Inclusive"}
              value={form.termsOfDelivery}
              onChange={(e) => update("termsOfDelivery", e.target.value)}
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
            {submitting ? "Generating..." : "Generate & Email Invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
