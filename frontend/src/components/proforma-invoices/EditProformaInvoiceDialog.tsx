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
import { updateProformaInvoice, type UpdateProformaInvoicePayload } from "@/api/proforma-invoices";
import type { ProformaInvoice } from "@/types";

interface EditProformaInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: ProformaInvoice | null;
  onSaved: (invoice: ProformaInvoice) => void;
}

interface FormState {
  invoiceDate: string;
  validUntil: string;
  paymentTerms: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branch: string;
  notes: string;
}

const emptyForm: FormState = {
  invoiceDate: "",
  validUntil: "",
  paymentTerms: "",
  bankName: "",
  accountNumber: "",
  ifscCode: "",
  branch: "",
  notes: "",
};

// Bug-fix requirement: correct a Proforma Invoice's printed details even
// after it's already been sent — sendInvoice() has never blocked
// resending, so "edit here, then Resend to Customer" is the intended
// fix-a-mistake flow. salesOrderId/amounts and advanceReceived (its own
// dedicated Record Advance Payment flow) are not editable here.
export default function EditProformaInvoiceDialog({
  open,
  onOpenChange,
  invoice,
  onSaved,
}: EditProformaInvoiceDialogProps) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && invoice) {
      setForm({
        invoiceDate: invoice.invoiceDate ? invoice.invoiceDate.slice(0, 10) : "",
        validUntil: invoice.validUntil ? invoice.validUntil.slice(0, 10) : "",
        paymentTerms: invoice.paymentTerms ?? "",
        bankName: invoice.bankName ?? "",
        accountNumber: invoice.accountNumber ?? "",
        ifscCode: invoice.ifscCode ?? "",
        branch: invoice.branch ?? "",
        notes: invoice.notes ?? "",
      });
      setError("");
    }
  }, [open, invoice]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleConfirm() {
    if (!invoice) return;
    setSubmitting(true);
    setError("");
    try {
      const payload: UpdateProformaInvoicePayload = {
        invoiceDate: form.invoiceDate || undefined,
        validUntil: form.validUntil || undefined,
        paymentTerms: form.paymentTerms.trim() || undefined,
        bankName: form.bankName.trim() || undefined,
        accountNumber: form.accountNumber.trim() || undefined,
        ifscCode: form.ifscCode.trim() || undefined,
        branch: form.branch.trim() || undefined,
        notes: form.notes.trim() || undefined,
      };
      const updated = await updateProformaInvoice(invoice.id, payload);
      toast.success("Proforma Invoice updated.");
      onSaved(updated);
      onOpenChange(false);
    } catch (err: any) {
      const message =
        err?.response?.data?.message || "Could not update the Proforma Invoice. Please try again.";
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
          <DialogTitle>Edit Proforma Invoice</DialogTitle>
          <DialogDescription>
            Correct <span className="font-medium text-slate-900">{invoice.invoiceNumber}</span>'s
            details below. If it was already sent, use "Resend to Customer" afterward so the
            customer gets the corrected PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="pi-edit-invoiceDate">Invoice Date</Label>
            <Input
              id="pi-edit-invoiceDate"
              type="date"
              value={form.invoiceDate}
              onChange={(e) => update("invoiceDate", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pi-edit-validUntil">Valid Until</Label>
            <Input
              id="pi-edit-validUntil"
              type="date"
              value={form.validUntil}
              onChange={(e) => update("validUntil", e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pi-edit-paymentTerms">Payment Terms</Label>
            <Input
              id="pi-edit-paymentTerms"
              placeholder="50% advance, balance before dispatch"
              value={form.paymentTerms}
              onChange={(e) => update("paymentTerms", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pi-edit-bankName">Bank Name</Label>
            <Input
              id="pi-edit-bankName"
              value={form.bankName}
              onChange={(e) => update("bankName", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pi-edit-accountNumber">Account Number</Label>
            <Input
              id="pi-edit-accountNumber"
              value={form.accountNumber}
              onChange={(e) => update("accountNumber", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pi-edit-ifscCode">IFSC Code</Label>
            <Input
              id="pi-edit-ifscCode"
              value={form.ifscCode}
              onChange={(e) => update("ifscCode", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pi-edit-branch">Branch</Label>
            <Input
              id="pi-edit-branch"
              value={form.branch}
              onChange={(e) => update("branch", e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pi-edit-notes">Notes</Label>
            <Textarea
              id="pi-edit-notes"
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
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
            {submitting ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
