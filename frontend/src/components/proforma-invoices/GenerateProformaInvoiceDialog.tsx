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
import type { ProformaInvoicePayload } from "@/api/proforma-invoices";
import type { SalesOrder } from "@/types";

interface GenerateProformaInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salesOrder: SalesOrder | null;
  onConfirm: (payload: Omit<ProformaInvoicePayload, "salesOrderId">) => Promise<void>;
}

interface FormState {
  validUntil: string;
  paymentTerms: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branch: string;
  notes: string;
}

const emptyForm: FormState = {
  validUntil: "",
  paymentTerms: "",
  bankName: "",
  accountNumber: "",
  ifscCode: "",
  branch: "",
  notes: "",
};

// Generates a Proforma Invoice from an existing Sales Order. Customer and
// amounts are always copied from the Sales Order server-side — this dialog
// only collects the invoice-specific details a Sales Order doesn't already
// have (bank details, validity, notes), plus an optional payment-terms
// override. There is no separate "Create" page: this dialog IS the create
// flow, per the "Generate Proforma Invoice" button in scope.
export default function GenerateProformaInvoiceDialog({
  open,
  onOpenChange,
  salesOrder,
  onConfirm,
}: GenerateProformaInvoiceDialogProps) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && salesOrder) {
      setForm({ ...emptyForm, paymentTerms: salesOrder.paymentTerms ?? "" });
      setError("");
    }
  }, [open, salesOrder]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleConfirm() {
    setSubmitting(true);
    setError("");
    try {
      await onConfirm({
        validUntil: form.validUntil || undefined,
        paymentTerms: form.paymentTerms.trim() || undefined,
        bankName: form.bankName.trim() || undefined,
        accountNumber: form.accountNumber.trim() || undefined,
        ifscCode: form.ifscCode.trim() || undefined,
        branch: form.branch.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      onOpenChange(false);
    } catch {
      setError("Could not generate the proforma invoice. Please try again.");
      toast.error("Could not generate the proforma invoice.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!salesOrder) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Generate Proforma Invoice</DialogTitle>
          <DialogDescription>
            Customer and amounts will be copied automatically from{" "}
            <span className="font-medium text-slate-900">{salesOrder.salesOrderNumber}</span>. Fill
            in any invoice-specific details below.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="validUntil">Valid Until</Label>
            <Input
              id="validUntil"
              type="date"
              value={form.validUntil}
              onChange={(e) => update("validUntil", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="paymentTerms">Payment Terms</Label>
            <Input
              id="paymentTerms"
              value={form.paymentTerms}
              onChange={(e) => update("paymentTerms", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bankName">Bank Name</Label>
            <Input
              id="bankName"
              value={form.bankName}
              onChange={(e) => update("bankName", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="accountNumber">Account Number</Label>
            <Input
              id="accountNumber"
              value={form.accountNumber}
              onChange={(e) => update("accountNumber", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ifscCode">IFSC Code</Label>
            <Input
              id="ifscCode"
              value={form.ifscCode}
              onChange={(e) => update("ifscCode", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="branch">Branch</Label>
            <Input id="branch" value={form.branch} onChange={(e) => update("branch", e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={form.notes} onChange={(e) => update("notes", e.target.value)} />
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
