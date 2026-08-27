import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import AddressAutoFill from "@/components/AddressAutoFill";
import SalesOrderItemsEditor, {
  computeItemDiscountTotal,
  computeSubtotal,
  type SalesOrderItemRow,
} from "@/components/sales-orders/SalesOrderItemsEditor";
import { getQuotation } from "@/api/quotations";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { isPastDateInputValue, todayDateInputValue } from "@/lib/date";
import {
  createSalesOrder,
  getSalesOrder,
  updateSalesOrder,
  type SalesOrderPayload,
} from "@/api/sales-orders";
import type { Quotation } from "@/types";

interface FormState {
  orderDate: string;
  deliveryDate: string;
  paymentTerms: string;
  advancePercentage: string;
  gstPercent: string;
  discount: string;
  billingAddress: string;
  shippingAddress: string;
  specialInstructions: string;
  remarks: string;
}

const emptyForm: FormState = {
  orderDate: "",
  deliveryDate: "",
  paymentTerms: "",
  advancePercentage: "",
  gstPercent: "18",
  discount: "0",
  billingAddress: "",
  shippingAddress: "",
  specialInstructions: "",
  remarks: "",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

function toDateInputValue(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

export default function SalesOrderForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const [searchParams] = useSearchParams();
  const quotationIdParam = searchParams.get("quotationId");
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState>(emptyForm);
  // "Same as Billing Address" — free, no-API convenience: while checked,
  // Shipping Address mirrors Billing Address on every change and its own
  // field is locked; unchecking leaves whatever was last copied there,
  // editable again.
  const [sameAsBilling, setSameAsBilling] = useState(false);
  const [items, setItems] = useState<SalesOrderItemRow[]>([]);
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [customerLabel, setCustomerLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadForCreate(quotationId: string) {
      setLoading(true);
      try {
        const q = await getQuotation(quotationId);
        if (cancelled) return;
        if (q.status !== "ACCEPTED") {
          setLoadError("Sales Orders can only be created from an Accepted quotation.");
          return;
        }
        setQuotation(q);
        setCustomerLabel(q.customer ? `${q.customer.companyName} — ${q.customer.contactPerson}` : "");
        setForm((f) => ({ ...f, gstPercent: String(q.gstPercent) }));
        setItems(
          (q.items ?? []).map((item) => ({
            productId: item.productId,
            productName: item.product?.name ?? "Unknown product",
            description: item.description ?? undefined,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: 0,
          }))
        );
      } catch {
        setLoadError("Could not load the quotation for this sales order.");
        toast.error("Could not load the quotation for this sales order.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    async function loadForEdit(salesOrderId: string) {
      setLoading(true);
      try {
        const so = await getSalesOrder(salesOrderId);
        if (cancelled) return;
        setCustomerLabel(so.customer ? `${so.customer.companyName} — ${so.customer.contactPerson}` : "");
        const itemDiscountSum = (so.items ?? []).reduce((sum, i) => sum + i.discount, 0);
        const extraDiscount = Math.max(0, so.discount - itemDiscountSum);
        setForm({
          orderDate: toDateInputValue(so.orderDate),
          deliveryDate: toDateInputValue(so.deliveryDate),
          paymentTerms: so.paymentTerms ?? "",
          advancePercentage: so.advancePercentage != null ? String(so.advancePercentage) : "",
          gstPercent: "18",
          discount: String(extraDiscount),
          billingAddress: so.billingAddress ?? "",
          shippingAddress: so.shippingAddress ?? "",
          specialInstructions: so.specialInstructions ?? "",
          remarks: so.remarks ?? "",
        });
        setSameAsBilling(
          !!so.billingAddress && so.billingAddress === so.shippingAddress,
        );
        setItems(
          (so.items ?? []).map((item) => ({
            productId: item.productId,
            productName: item.product?.name ?? "Unknown product",
            description: item.description ?? undefined,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
          }))
        );
      } catch {
        setLoadError("Could not load this sales order.");
        toast.error("Could not load this sales order.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (isEdit && id) {
      loadForEdit(id);
    } else if (quotationIdParam) {
      loadForCreate(quotationIdParam);
    } else {
      setLoadError(
        "A Sales Order can only be created from an Accepted Quotation. Open an Accepted quotation and click \"Create Sales Order\"."
      );
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [isEdit, id, quotationIdParam]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  useEffect(() => {
    if (sameAsBilling) {
      setForm((f) => (f.shippingAddress === f.billingAddress ? f : { ...f, shippingAddress: f.billingAddress }));
    }
  }, [sameAsBilling, form.billingAddress]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError("");

    // You can't promise delivery on a date that's already passed. Order
    // Date is left unrestricted — backdating the order itself (catching up
    // on data entry) is legitimate.
    if (isPastDateInputValue(form.deliveryDate)) {
      setSubmitError("Delivery Date cannot be before today.");
      return;
    }

    const payload: SalesOrderPayload = {
      quotationId: quotationIdParam ?? "",
      items: items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount ?? 0,
        description: item.description,
      })),
      orderDate: form.orderDate || undefined,
      deliveryDate: form.deliveryDate || undefined,
      paymentTerms: form.paymentTerms.trim() || undefined,
      advancePercentage: form.advancePercentage.trim() ? Number(form.advancePercentage) : undefined,
      gstPercent: form.gstPercent.trim() ? Number(form.gstPercent) : undefined,
      discount: form.discount.trim() ? Number(form.discount) : undefined,
      billingAddress: form.billingAddress.trim() || undefined,
      shippingAddress: form.shippingAddress.trim() || undefined,
      specialInstructions: form.specialInstructions.trim() || undefined,
      remarks: form.remarks.trim() || undefined,
    };

    setSubmitting(true);
    try {
      if (isEdit && id) {
        const { quotationId: _quotationId, ...updatePayload } = payload;
        await updateSalesOrder(id, updatePayload);
        toast.success("Sales Order updated successfully.");
        navigate(`/sales-orders/${id}`);
      } else {
        const created = await createSalesOrder(payload);
        toast.success("Sales Order created successfully.");
        navigate(`/sales-orders/${created.id}`);
      }
    } catch (err: any) {
      const raw =
        err?.response?.data?.message || "Something went wrong while saving this sales order. Please try again.";
      const message = Array.isArray(raw) ? raw.join(" ") : raw;
      setSubmitError(message);
      toast.error(message);
      setSubmitting(false);
    }
  }

  const subtotal = computeSubtotal(items);
  const itemDiscountSum = computeItemDiscountTotal(items);
  const extraDiscount = form.discount.trim() ? Number(form.discount) || 0 : 0;
  const totalDiscount = itemDiscountSum + extraDiscount;
  const gstPercentNum = form.gstPercent.trim() ? Number(form.gstPercent) || 0 : 0;
  const tax = (subtotal - itemDiscountSum) * (gstPercentNum / 100);
  const grandTotal = subtotal - totalDiscount + tax;

  return (
    <div className="flex h-screen bg-app-grid">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title={isEdit ? "Edit Sales Order" : "Create Sales Order"} />
        <main className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Spinner /> Loading...
            </div>
          ) : loadError ? (
            <div className="mx-auto max-w-2xl rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {loadError}
              <div className="mt-3">
                <Button variant="outline" size="sm" onClick={() => navigate("/quotations")}>
                  Go to Quotations
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mx-auto max-w-4xl space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Customer & Quotation</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Customer (auto-populated)
                    </p>
                    <p className="text-sm text-slate-900">{customerLabel || "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Quotation
                    </p>
                    <p className="text-sm text-slate-900">
                      {quotation?.quotationNumber ?? "Linked quotation"}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Items</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <SalesOrderItemsEditor value={items} onChange={setItems} />

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="gstPercent">GST %</Label>
                      <Input
                        id="gstPercent"
                        inputMode="decimal"
                        value={form.gstPercent}
                        onChange={(e) => update("gstPercent", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="discount">Additional Discount</Label>
                      <Input
                        id="discount"
                        inputMode="decimal"
                        value={form.discount}
                        onChange={(e) => update("discount", e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">On top of any per-line discounts</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 rounded-md border bg-slate-50 p-4 text-sm sm:grid-cols-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Subtotal</p>
                      <p className="font-medium text-slate-900">{formatCurrency(subtotal)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Discount</p>
                      <p className="font-medium text-slate-900">{formatCurrency(totalDiscount)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        GST ({gstPercentNum || 0}%)
                      </p>
                      <p className="font-medium text-slate-900">{formatCurrency(tax)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Grand Total</p>
                      <p className="font-semibold text-slate-900">{formatCurrency(grandTotal)}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Totals shown above are a live preview — the backend recalculates and stores the
                    authoritative figures when you save.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Order Details</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="orderDate">Order Date</Label>
                    <Input
                      id="orderDate"
                      type="date"
                      value={form.orderDate}
                      onChange={(e) => update("orderDate", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deliveryDate">Delivery Date</Label>
                    <Input
                      id="deliveryDate"
                      type="date"
                      min={todayDateInputValue()}
                      value={form.deliveryDate}
                      onChange={(e) => update("deliveryDate", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="advancePercentage">Advance %</Label>
                    <Input
                      id="advancePercentage"
                      inputMode="decimal"
                      value={form.advancePercentage}
                      onChange={(e) => update("advancePercentage", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-3">
                    <Label htmlFor="paymentTerms">Payment Terms</Label>
                    <Input
                      id="paymentTerms"
                      value={form.paymentTerms}
                      onChange={(e) => update("paymentTerms", e.target.value)}
                      placeholder="e.g. 50% advance, balance before dispatch"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <AddressAutoFill
                      id="billingAddress"
                      label="Billing Address"
                      value={form.billingAddress}
                      onChange={(value) => update("billingAddress", value)}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-3">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <Checkbox
                        checked={sameAsBilling}
                        onChange={(e) => setSameAsBilling(e.target.checked)}
                      />
                      Shipping address same as billing address
                    </label>
                    <AddressAutoFill
                      id="shippingAddress"
                      label="Shipping Address"
                      value={form.shippingAddress}
                      onChange={(value) => update("shippingAddress", value)}
                      disabled={sameAsBilling}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-3">
                    <Label htmlFor="specialInstructions">Special Instructions</Label>
                    <Textarea
                      id="specialInstructions"
                      value={form.specialInstructions}
                      onChange={(e) => update("specialInstructions", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-3">
                    <Label htmlFor="remarks">Remarks</Label>
                    <Textarea
                      id="remarks"
                      value={form.remarks}
                      onChange={(e) => update("remarks", e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>

              {submitError && <p className="text-sm text-destructive">{submitError}</p>}

              <div className="flex justify-end gap-2 pb-6">
                <Button type="button" variant="outline" onClick={() => navigate(-1)} disabled={submitting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting || items.length === 0}>
                  {submitting && <Spinner className="mr-2 h-4 w-4" />}
                  {submitting ? "Saving..." : isEdit ? "Save Changes" : "Create Sales Order"}
                </Button>
              </div>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}
