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
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  useEffect(() => {
    if (open && salesOrder) {
      setForm({ ...emptyForm, destination: salesOrder.customer?.state ?? "" });
      setError("");
      setFieldErrors({});
    }
  }, [open, salesOrder]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((fe) => ({ ...fe, [key]: undefined }));
  }

  // Buyer's Order No., Destination, and Terms of Delivery are required on
  // the printed Tax Invoice — no longer silently fall back to defaults like
  // "Verbal"/"By Road". Dispatched Through stays optional.
  function validate(): boolean {
    const errors: Partial<Record<keyof FormState, string>> = {};
    if (!form.buyersOrderNo.trim()) errors.buyersOrderNo = "Buyer's Order No. is required.";
    if (!form.destination.trim()) errors.destination = "Destination is required.";
    if (!form.termsOfDelivery.trim()) errors.termsOfDelivery = "Terms of Delivery is required.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleConfirm() {
    setError("");
    if (!validate()) return;
    setSubmitting(true);
    try {
      await onConfirm({
        buyersOrderNo: form.buyersOrderNo.trim(),
        dispatchedThrough: form.dispatchedThrough.trim() || undefined,
        destination: form.destination.trim(),
        termsOfDelivery: form.termsOfDelivery.trim(),
      });
      onOpenChange(false);
    } catch (err: any) {
      const message =
        err?.response?.data?.message || "Could not generate the Tax Invoice. Please try again.";
      setError(Array.isArray(message) ? message.join(" ") : message);
      toast.error(Array.isArray(message) ? message.join(" ") : message);
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
            <span className="font-medium text-slate-900">{salesOrder.salesOrderNumber}</span>.
            You'll be able to review the PDF and choose who to send it to on the next screen —
            it won't be emailed automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="buyersOrderNo">
              Buyer's Order No. <span className="text-destructive">*</span>
            </Label>
            <Input
              id="buyersOrderNo"
              placeholder="PO-12345"
              value={form.buyersOrderNo}
              onChange={(e) => update("buyersOrderNo", e.target.value)}
              className={fieldErrors.buyersOrderNo ? "border-destructive" : undefined}
            />
            {fieldErrors.buyersOrderNo && (
              <p className="text-xs text-destructive">{fieldErrors.buyersOrderNo}</p>
            )}
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
            <Label htmlFor="destination">
              Destination <span className="text-destructive">*</span>
            </Label>
            <Input
              id="destination"
              value={form.destination}
              onChange={(e) => update("destination", e.target.value)}
              className={fieldErrors.destination ? "border-destructive" : undefined}
            />
            {fieldErrors.destination && (
              <p className="text-xs text-destructive">{fieldErrors.destination}</p>
            )}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="termsOfDelivery">
              Terms of Delivery <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="termsOfDelivery"
              placeholder={"Packing: Inclusive\nInstallation: Inclusive\nFreight: Inclusive"}
              value={form.termsOfDelivery}
              onChange={(e) => update("termsOfDelivery", e.target.value)}
              className={fieldErrors.termsOfDelivery ? "border-destructive" : undefined}
            />
            {fieldErrors.termsOfDelivery && (
              <p className="text-xs text-destructive">{fieldErrors.termsOfDelivery}</p>
            )}
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
            {submitting ? "Generating..." : "Generate Invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
