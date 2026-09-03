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
import { updateTaxInvoice, type UpdateTaxInvoicePayload } from "@/api/tax-invoices";
import type { TaxInvoice } from "@/types";

interface EditTaxInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: TaxInvoice | null;
  onSaved: (invoice: TaxInvoice) => void;
}

interface FormState {
  invoiceDate: string;
  buyersOrderNo: string;
  dispatchedThrough: string;
  destination: string;
  termsOfDelivery: string;
}

const emptyForm: FormState = {
  invoiceDate: "",
  buyersOrderNo: "",
  dispatchedThrough: "",
  destination: "",
  termsOfDelivery: "",
};

// Bug-fix requirement: correct a Tax Invoice's printed details even after
// it's already been sent — sendInvoice() has never blocked resending, so
// "edit here, then Resend to Customer" is the intended fix-a-mistake flow.
// Fields mirror GenerateTaxInvoiceDialog exactly (same required set), plus
// Invoice Date which the create dialog doesn't collect but this one can
// still correct. salesOrderId/amounts are not editable.
export default function EditTaxInvoiceDialog({
  open,
  onOpenChange,
  invoice,
  onSaved,
}: EditTaxInvoiceDialogProps) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  useEffect(() => {
    if (open && invoice) {
      setForm({
        invoiceDate: invoice.invoiceDate ? invoice.invoiceDate.slice(0, 10) : "",
        buyersOrderNo: invoice.buyersOrderNo ?? "",
        dispatchedThrough: invoice.dispatchedThrough ?? "",
        destination: invoice.destination ?? "",
        termsOfDelivery: invoice.termsOfDelivery ?? "",
      });
      setError("");
      setFieldErrors({});
    }
  }, [open, invoice]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((fe) => ({ ...fe, [key]: undefined }));
  }

  function validate(): boolean {
    const errors: Partial<Record<keyof FormState, string>> = {};
    if (!form.buyersOrderNo.trim()) errors.buyersOrderNo = "Buyer's Order No. is required.";
    if (!form.destination.trim()) errors.destination = "Destination is required.";
    if (!form.termsOfDelivery.trim()) errors.termsOfDelivery = "Terms of Delivery is required.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleConfirm() {
    if (!invoice) return;
    setError("");
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload: UpdateTaxInvoicePayload = {
        invoiceDate: form.invoiceDate || undefined,
        buyersOrderNo: form.buyersOrderNo.trim(),
        dispatchedThrough: form.dispatchedThrough.trim() || undefined,
        destination: form.destination.trim(),
        termsOfDelivery: form.termsOfDelivery.trim(),
      };
      const updated = await updateTaxInvoice(invoice.id, payload);
      toast.success("Tax Invoice updated.");
      onSaved(updated);
      onOpenChange(false);
    } catch (err: any) {
      const message =
        err?.response?.data?.message || "Could not update the Tax Invoice. Please try again.";
      setError(Array.isArray(message) ? message.join(" ") : message);
      toast.error(Array.isArray(message) ? message.join(" ") : message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Edit Tax Invoice</DialogTitle>
          <DialogDescription>
            Correct <span className="font-medium text-slate-900">{invoice.invoiceNumber}</span>'s
            details below. If it was already sent, use "Resend to Customer" afterward so the
            customer gets the corrected PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="edit-invoiceDate">Invoice Date</Label>
            <Input
              id="edit-invoiceDate"
              type="date"
              value={form.invoiceDate}
              onChange={(e) => update("invoiceDate", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-buyersOrderNo">
              Buyer's Order No. <span className="text-destructive">*</span>
            </Label>
            <Input
              id="edit-buyersOrderNo"
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
            <Label htmlFor="edit-dispatchedThrough">Dispatched Through</Label>
            <Input
              id="edit-dispatchedThrough"
              placeholder="By Road"
              value={form.dispatchedThrough}
              onChange={(e) => update("dispatchedThrough", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-destination">
              Destination <span className="text-destructive">*</span>
            </Label>
            <Input
              id="edit-destination"
              value={form.destination}
              onChange={(e) => update("destination", e.target.value)}
              className={fieldErrors.destination ? "border-destructive" : undefined}
            />
            {fieldErrors.destination && (
              <p className="text-xs text-destructive">{fieldErrors.destination}</p>
            )}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="edit-termsOfDelivery">
              Terms of Delivery <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="edit-termsOfDelivery"
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
            {submitting ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
