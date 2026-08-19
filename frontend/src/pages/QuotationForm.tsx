import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import CustomerSelect from "@/components/quotations/CustomerSelect";
import QuotationItemsEditor, {
  computeSubtotal,
} from "@/components/quotations/QuotationItemsEditor";
import {
  createQuotation,
  getQuotation,
  updateQuotation,
  type QuotationItemPayload,
  type QuotationPayload,
} from "@/api/quotations";

interface FormState {
  customerId: string;
  gstPercent: string;
  validUntil: string;
  notes: string;
  terms: string;
}

const emptyForm: FormState = {
  customerId: "",
  gstPercent: "18",
  validUntil: "",
  notes: "",
  terms: "",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

// Dates come back from the API as full ISO timestamps; <input type="date">
// needs just the yyyy-mm-dd portion.
function toDateInputValue(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

export default function QuotationForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [items, setItems] = useState<QuotationItemPayload[]>([]);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>> & { items?: string }>({});
  const [loading, setLoading] = useState(isEdit);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isEdit || !id) return;
    const quotationId = id;
    let cancelled = false;
    async function loadQuotation() {
      setLoading(true);
      try {
        const quotation = await getQuotation(quotationId);
        if (cancelled) return;
        setForm({
          customerId: quotation.customerId,
          gstPercent: String(quotation.gstPercent),
          validUntil: toDateInputValue(quotation.validUntil),
          notes: quotation.notes ?? "",
          terms: quotation.terms ?? "",
        });
        setItems(
          (quotation.items ?? []).map((item) => ({
            productId: item.productId,
            description: item.description ?? undefined,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          }))
        );
      } catch {
        setSubmitError("Could not load this quotation.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadQuotation();
    return () => {
      cancelled = true;
    };
  }, [isEdit, id]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> & { items?: string } = {};

    if (!form.customerId) next.customerId = "Customer is required";
    if (items.length === 0) next.items = "Add at least one item";
    if (form.gstPercent.trim()) {
      const parsed = Number(form.gstPercent);
      if (Number.isNaN(parsed) || parsed < 0) {
        next.gstPercent = "GST percent must be a positive number";
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError("");
    if (!validate()) return;

    const payload: QuotationPayload = {
      customerId: form.customerId,
      items,
      gstPercent: form.gstPercent.trim() ? Number(form.gstPercent) : undefined,
      validUntil: form.validUntil || undefined,
      notes: form.notes.trim() || undefined,
      terms: form.terms.trim() || undefined,
    };

    setSubmitting(true);
    try {
      if (isEdit && id) {
        await updateQuotation(id, payload);
        navigate(`/quotations/${id}`);
      } else {
        const created = await createQuotation(payload);
        navigate(`/quotations/${created.id}`);
      }
    } catch {
      setSubmitError("Something went wrong while saving this quotation. Please try again.");
      setSubmitting(false);
    }
  }

  const subtotal = computeSubtotal(items);
  const gstPercentNum = form.gstPercent.trim() ? Number(form.gstPercent) || 0 : 0;
  const gstAmount = subtotal * (gstPercentNum / 100);
  const grandTotal = subtotal + gstAmount;

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title={isEdit ? "Edit Quotation" : "Create Quotation"} />
        <main className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading quotation...</p>
          ) : (
            <form onSubmit={handleSubmit} className="mx-auto max-w-4xl space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Customer</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Label htmlFor="customerId">Customer *</Label>
                  <CustomerSelect
                    id="customerId"
                    value={form.customerId}
                    onChange={(customerId) => update("customerId", customerId)}
                  />
                  {errors.customerId && (
                    <p className="text-xs text-destructive">{errors.customerId}</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Items</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <QuotationItemsEditor value={items} onChange={setItems} />
                  {errors.items && <p className="text-xs text-destructive">{errors.items}</p>}

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="gstPercent">GST %</Label>
                      <Input
                        id="gstPercent"
                        inputMode="decimal"
                        value={form.gstPercent}
                        onChange={(e) => update("gstPercent", e.target.value)}
                      />
                      {errors.gstPercent && (
                        <p className="text-xs text-destructive">{errors.gstPercent}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="validUntil">Valid Until</Label>
                      <Input
                        id="validUntil"
                        type="date"
                        value={form.validUntil}
                        onChange={(e) => update("validUntil", e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 rounded-md border bg-slate-50 p-4 text-sm sm:grid-cols-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Subtotal</p>
                      <p className="font-medium text-slate-900">{formatCurrency(subtotal)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        GST ({gstPercentNum || 0}%)
                      </p>
                      <p className="font-medium text-slate-900">{formatCurrency(gstAmount)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Grand Total</p>
                      <p className="font-semibold text-slate-900">{formatCurrency(grandTotal)}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Subtotal, GST, and Grand Total shown above are a live preview — the backend
                    recalculates these from the submitted items when you save.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Notes & Terms</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      value={form.notes}
                      onChange={(e) => update("notes", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="terms">Terms</Label>
                    <Textarea
                      id="terms"
                      value={form.terms}
                      onChange={(e) => update("terms", e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>

              {submitError && <p className="text-sm text-destructive">{submitError}</p>}

              <div className="flex justify-end gap-2 pb-6">
                <Button type="button" variant="outline" onClick={() => navigate(-1)} disabled={submitting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Saving..." : isEdit ? "Save Changes" : "Save Draft"}
                </Button>
              </div>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}
