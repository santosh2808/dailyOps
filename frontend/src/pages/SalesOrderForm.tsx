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
import { getErrorMessage } from "@/lib/errors";
import { scrollToFirstError } from "@/lib/scrollToFirstError";
import { isPastDateInputValue, todayDateInputValue } from "@/lib/date";
import {
  createSalesOrder,
  getSalesOrder,
  updateSalesOrder,
  type SalesOrderPayload,
} from "@/api/sales-orders";
import type { Quotation } from "@/types";

// Same wording QuotationForm.tsx defaults Commercial Terms -> Payment to
// (COMMERCIAL_TERMS_DEFAULTS.payment there) — carried forward here so a new
// Sales Order's Payment Terms isn't left blank when the source quotation
// already said this, and still lands on the same default even when there's
// no quotation commercial-terms payment value to copy. Kept editable (not
// locked/required) since a genuine no-advance-yet order — the case the
// named-approver override on Record Advance Payment / Generate JEO exists
// for — should be able to say something else here.
const DEFAULT_PAYMENT_TERMS = "50% advance along with the Purchase order, balance before dispatch.";

interface FormState {
  orderDate: string;
  deliveryDate: string;
  paymentTerms: string;
  gstPercent: string;
  billingAddress: string;
  shippingAddress: string;
  // The customer's own Purchase Order number — required, same as
  // Billing/Shipping Address, per business owner (a Sales Order is the
  // seller's record of the same commitment the customer's PO makes; see
  // backend/prisma/schema.prisma's comment on SalesOrder.customerPoNumber).
  customerPoNumber: string;
  // Some customers genuinely won't issue a formal PO — this checkbox +
  // reason swaps in for customerPoNumber instead of blocking the form. See
  // CreateSalesOrderDto.noPoAvailable's comment.
  noPoAvailable: boolean;
  noPoReason: string;
  specialInstructions: string;
  remarks: string;
}

const emptyForm: FormState = {
  orderDate: "",
  deliveryDate: "",
  paymentTerms: "",
  gstPercent: "18",
  billingAddress: "",
  shippingAddress: "",
  customerPoNumber: "",
  noPoAvailable: false,
  noPoReason: "",
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

  // Order Date defaults to today (matching the backend's own default when
  // omitted — see CreateSalesOrderDto.orderDate) rather than a blank field
  // staff had to fill in themselves every time. Set via a lazy initializer
  // (not baked into the module-level emptyForm constant) so it's always
  // today's date at the moment this form is actually opened, not whenever
  // the module happened to load. loadForEdit() below overwrites this with
  // the real saved orderDate for existing orders, so it only ever applies
  // to new Sales Orders.
  const [form, setForm] = useState<FormState>(() => ({ ...emptyForm, orderDate: todayDateInputValue() }));
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
  // "items" isn't a FormState field (it's the separate items[] array edited
  // via SalesOrderItemsEditor) but shares this same error-bag/scroll-to-
  // first-error convention — see the per-line discount check in validate().
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>> & { items?: string }>({});

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
        setForm((f) => ({
          ...f,
          gstPercent: String(q.gstPercent),
          // Pre-fill from the accepted quotation's own Payment Terms
          // (carrying forward whatever it said, e.g. a negotiated
          // variation) and fall back to the standard 50%-advance wording
          // when the quotation didn't set one. Staff can still edit or
          // clear this — it's descriptive text, not the actual advance
          // gate (see MINIMUM_ADVANCE_PERCENT enforcement on Record
          // Advance Payment / Generate JEO / Dispatch).
          paymentTerms: q.commercialTerms?.payment?.trim() || DEFAULT_PAYMENT_TERMS,
        }));
        setItems(
          (q.items ?? []).map((item) => ({
            productId: item.productId,
            productName: item.product?.name ?? "Unknown product",
            description: item.description ?? undefined,
            quantity: item.quantity,
            // QA bug fix (Sales Order Grand Total mismatch FAIL): this used
            // to be the quotation item's raw unitPrice, which excludes its
            // per-unit colour/hanging-structure charge (folded into
            // lineTotal instead — see QuotationsService.computeTotals()).
            // Seeding the row with the effective (charge-inclusive) unit
            // price instead keeps this row's own total correct, and makes
            // the Grand Total preview below correct for it too whenever the
            // item is left unmodified.
            unitPrice:
              item.quantity > 0 ? Math.round((item.lineTotal / item.quantity) * 100) / 100 : item.unitPrice,
            discount: 0,
          }))
        );
      } catch (err) {
        const message = getErrorMessage(err, "Could not load the quotation for this sales order.");
        setLoadError(message);
        toast.error(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    async function loadForEdit(salesOrderId: string) {
      setLoading(true);
      try {
        const so = await getSalesOrder(salesOrderId);
        if (cancelled) return;
        // QA bug fix (SC-009): a Sales Order is only editable while it's
        // still a Draft — the Details page already hides/disables the Edit
        // action once it's Confirmed or later, but this page is reachable
        // directly by URL too, and the backend rejects the save either way
        // (SalesOrdersService.update()). Catch it here, before the form
        // even renders, rather than let someone fill out changes that will
        // only fail once they hit Save.
        if (so.status !== "DRAFT") {
          setLoadError(
            `This Sales Order is ${so.status === "CANCELLED" ? "cancelled" : "no longer in Draft status"} and can no longer be edited.`,
          );
          return;
        }
        setCustomerLabel(so.customer ? `${so.customer.companyName} — ${so.customer.contactPerson}` : "");
        setForm({
          orderDate: toDateInputValue(so.orderDate),
          deliveryDate: toDateInputValue(so.deliveryDate),
          paymentTerms: so.paymentTerms ?? "",
          gstPercent: "18",
          billingAddress: so.billingAddress ?? "",
          shippingAddress: so.shippingAddress ?? "",
          customerPoNumber: so.customerPoNumber ?? "",
          noPoAvailable: so.noPoAvailable ?? false,
          noPoReason: so.noPoReason ?? "",
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
      } catch (err) {
        const message = getErrorMessage(err, "Could not load this sales order.");
        setLoadError(message);
        toast.error(message);
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
    // Clear this field's validation error the moment the user edits it,
    // rather than leaving a stale "X is required." message on screen until
    // they resubmit the whole form (QA report: filling in the field should
    // make the error go away immediately).
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  useEffect(() => {
    if (sameAsBilling) {
      setForm((f) => (f.shippingAddress === f.billingAddress ? f : { ...f, shippingAddress: f.billingAddress }));
    }
  }, [sameAsBilling, form.billingAddress]);

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> & { items?: string } = {};

    // Required per business owner — production/dispatch planning needs a
    // target date on every order. Order Date is left unrestricted/optional
    // by contrast — backdating the order itself (catching up on data
    // entry) is legitimate, and it already defaults to today (see the
    // lazy useState initializer above).
    if (!form.deliveryDate) {
      next.deliveryDate = "Delivery Date is required.";
    } else if (isPastDateInputValue(form.deliveryDate)) {
      next.deliveryDate = "Delivery Date cannot be before today.";
    }

    if (form.gstPercent.trim()) {
      const parsed = Number(form.gstPercent);
      if (Number.isNaN(parsed) || parsed < 0) {
        next.gstPercent = "GST percent must be a positive number";
      }
    }

    // QA bug fix (SC-005): both addresses are required to save a Sales
    // Order — dispatch, installation, and invoicing all depend on a real
    // address, and this form previously let both be left blank entirely.
    // Shipping Address can still be satisfied via the "same as billing"
    // checkbox (it copies Billing Address in automatically, see the
    // sameAsBilling effect above), so this only fires when neither path
    // filled it in.
    if (!form.billingAddress.trim()) {
      next.billingAddress = "Billing Address is required.";
    }
    if (!form.shippingAddress.trim()) {
      next.shippingAddress = "Shipping Address is required.";
    }

    // Purchase Order Number is required per business owner, unless the
    // customer genuinely won't issue one — then a reason is required
    // instead. See CreateSalesOrderDto.customerPoNumber/noPoAvailable's
    // comment.
    if (form.noPoAvailable) {
      if (!form.noPoReason.trim()) {
        next.noPoReason = "Please note why no Purchase Order is available.";
      }
    } else if (!form.customerPoNumber.trim()) {
      next.customerPoNumber = "Purchase Order Number is required.";
    }

    // QA bug fix (SC-004): the order-level "Additional Discount" field was
    // removed (redundant with Quotation.discount, and unclamped — a
    // discount larger than the subtotal drove the grand total negative).
    // Per-line item discount is the one discounting mechanism left here, so
    // it needs the same "can't exceed what it's discounting off of" check
    // the backend now enforces (SalesOrdersService.computeTotals()) —
    // otherwise a single line's discount could still push its own line
    // total (and the order total) negative before the user ever submits.
    const invalidItem = items.find((item) => (item.discount ?? 0) > item.quantity * (item.unitPrice ?? 0));
    if (invalidItem) {
      next.items = `${invalidItem.productName}'s discount can't exceed that line's own amount (Qty × Unit Price).`;
    }

    // Bug fix (TC-067): scroll/focus the topmost invalid field so a failed
    // submit is never silently invisible on a scrolled form.
    scrollToFirstError(next);
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError("");
    if (!validate()) return;

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
      gstPercent: form.gstPercent.trim() ? Number(form.gstPercent) : undefined,
      billingAddress: form.billingAddress.trim() || undefined,
      shippingAddress: form.shippingAddress.trim() || undefined,
      customerPoNumber: form.noPoAvailable ? undefined : form.customerPoNumber.trim() || undefined,
      noPoAvailable: form.noPoAvailable,
      noPoReason: form.noPoAvailable ? form.noPoReason.trim() || undefined : undefined,
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

  // Bug fix (QA: "Quotation -> Sales Order" charge breakdown FAIL) — this
  // preview used to sum items + GST only, silently leaving out
  // Installation/Transportation entirely, so it showed a Grand Total far
  // below what the backend actually saves (which already carries these
  // charges forward from the accepted quotation — see
  // SalesOrdersService.freezeToQuotationTotalsIfUnmodified). Mirrors that
  // same backend condition exactly: charges only carry forward when every
  // item still matches the quotation's own quantity with no per-line
  // discount — otherwise the backend doesn't guess how they should scale
  // with a changed quantity, and neither does this preview.
  const matchesQuotationExactly =
    !!quotation &&
    items.length === (quotation.items?.length ?? 0) &&
    items.every((item) => {
      const qi = quotation.items?.find((q) => q.productId === item.productId);
      return !!qi && qi.quantity === item.quantity && (item.discount ?? 0) === 0;
    });

  // QA bug fix (Sales Order Grand Total mismatch FAIL): when unmodified,
  // read the quotation's own authoritative subtotal/GST/Grand Total instead
  // of recomputing them here — re-deriving GST locally missed that it's
  // calculated on subtotal+installation+transportation, not subtotal alone
  // (see QuotationsService.computeTotals()), which understated tax even
  // after the per-item colour/hanging-structure charge fix above. Reading
  // the quotation's own numbers keeps this preview correct without having
  // to keep two copies of that formula in sync. Falls back to the same
  // from-scratch computation as before whenever the order has actually
  // been modified (SalesOrdersService.computeTotals()'s own behavior for a
  // modified order doesn't carry installation/transportation forward
  // either, so this preview doesn't either).
  const subtotal = matchesQuotationExactly ? quotation!.subtotal : computeSubtotal(items);
  const itemDiscountSum = computeItemDiscountTotal(items);
  const gstPercentNum = form.gstPercent.trim() ? Number(form.gstPercent) || 0 : 0;
  const tax = matchesQuotationExactly
    ? quotation!.gstAmount
    : Math.max(0, subtotal - itemDiscountSum) * (gstPercentNum / 100);
  // QA bug fix (SC-004): mirrors SalesOrdersService.computeTotals()'s own
  // clamp — validate() already stops any single line's discount from
  // exceeding that line's own amount before submit, but the SUM across
  // lines could still exceed subtotal+tax if several lines are discounted
  // generously at once. Clamping here keeps this preview (and the Grand
  // Total below) from ever showing a negative figure the backend wouldn't
  // actually save.
  const totalDiscount = matchesQuotationExactly
    ? 0
    : Math.min(Math.max(0, itemDiscountSum), subtotal + tax);

  const installationCharge = matchesQuotationExactly ? quotation!.installationCharge : 0;
  const transportationCharge = matchesQuotationExactly ? quotation!.transportationCharge : 0;
  // Mirrors SalesOrdersService.freezeToQuotationTotalsIfUnmodified()'s own
  // pricesIncludeChargesAndGst branch — that flag means the quotation's
  // grandTotal already includes GST, so adding quotation.gstAmount again
  // here would double-count it, same bug just fixed backend-side.
  const grandTotal = matchesQuotationExactly
    ? quotation!.pricesIncludeChargesAndGst
      ? quotation!.grandTotal
      : Math.round((quotation!.grandTotal + quotation!.gstAmount) * 100) / 100
    : subtotal - totalDiscount + tax + installationCharge + transportationCharge;

  return (
    <div className="flex min-h-dvh bg-app-grid pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Topbar title={isEdit ? "Edit Sales Order" : "Create Sales Order"} />
        <main className="flex-1 p-6">
          {loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Spinner /> Loading...
            </div>
          ) : loadError ? (
            <div className="mx-auto max-w-2xl rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {loadError}
              <div className="mt-3">
                {isEdit && id ? (
                  <Button variant="outline" size="sm" onClick={() => navigate(`/sales-orders/${id}`)}>
                    Back to Sales Order
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => navigate("/quotations")}>
                    Go to Quotations
                  </Button>
                )}
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
                  {/* QA bug fix (SC-004): the separate order-level "Additional
                      Discount" field was removed — it duplicated Quotation's
                      own discount mechanism and wasn't clamped against the
                      subtotal, so a large enough value drove the Grand Total
                      negative. Per-line item discount (in the editor above)
                      is the one discounting mechanism left at this stage; a
                      validation error for it (line discount exceeding that
                      line's own amount) surfaces here since there's no
                      single input field of its own to attach to. */}
                  {errors.items && <p className="text-xs text-destructive">{errors.items}</p>}

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:max-w-xs">
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
                  </div>

                  <div className="grid grid-cols-2 gap-2 rounded-md border bg-slate-50 p-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Subtotal</p>
                      <p className="font-medium text-slate-900">{formatCurrency(subtotal)}</p>
                    </div>
                    {/* QA bug fix ("Quotation -> Sales Order" charge breakdown
                        FAIL) — these were missing from this preview entirely,
                        so the Grand Total below looked far lower than what
                        the backend actually saves. Shown as "—" (not ₹0) when
                        items no longer match the quotation exactly, since
                        that's also when the backend stops carrying them
                        forward — see matchesQuotationExactly above. */}
                    {quotation && (
                      <>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Installation</p>
                          <p className="font-medium text-slate-900">
                            {matchesQuotationExactly ? formatCurrency(installationCharge) : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Transportation</p>
                          <p className="font-medium text-slate-900">
                            {matchesQuotationExactly ? formatCurrency(transportationCharge) : "—"}
                          </p>
                        </div>
                      </>
                    )}
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
                  {quotation && !matchesQuotationExactly && (
                    <p className="text-xs text-muted-foreground">
                      Installation/Transportation charges from the quotation are only carried forward
                      when quantities and discounts are unchanged from it.
                    </p>
                  )}
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
                  <div className="space-y-2 sm:col-span-3">
                    <Label htmlFor="customerPoNumber">Purchase Order Number {!form.noPoAvailable && "*"}</Label>
                    <Input
                      id="customerPoNumber"
                      value={form.customerPoNumber}
                      onChange={(e) => update("customerPoNumber", e.target.value)}
                      placeholder="e.g. PO-2026-00456"
                      disabled={form.noPoAvailable}
                    />
                    <p className="text-xs text-muted-foreground">
                      The customer's own Purchase Order reference confirming this order. You can attach a
                      scan of the PO document after saving.
                    </p>
                    {errors.customerPoNumber && (
                      <p className="text-xs text-destructive">{errors.customerPoNumber}</p>
                    )}
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <Checkbox
                        checked={form.noPoAvailable}
                        onChange={(e) => update("noPoAvailable", e.target.checked)}
                      />
                      Customer will not provide a Purchase Order number
                    </label>
                    {form.noPoAvailable && (
                      <div className="space-y-2">
                        <Label htmlFor="noPoReason">Reason *</Label>
                        <Textarea
                          id="noPoReason"
                          value={form.noPoReason}
                          onChange={(e) => update("noPoReason", e.target.value)}
                          placeholder="e.g. Customer confirmed verbally over phone; will not issue a formal PO."
                          rows={2}
                        />
                        {errors.noPoReason && (
                          <p className="text-xs text-destructive">{errors.noPoReason}</p>
                        )}
                      </div>
                    )}
                  </div>
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
                    <Label htmlFor="deliveryDate">Delivery Date *</Label>
                    <Input
                      id="deliveryDate"
                      type="date"
                      min={todayDateInputValue()}
                      value={form.deliveryDate}
                      onChange={(e) => update("deliveryDate", e.target.value)}
                    />
                    {errors.deliveryDate && (
                      <p className="text-xs text-destructive">{errors.deliveryDate}</p>
                    )}
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
                      label="Billing Address *"
                      value={form.billingAddress}
                      onChange={(value) => update("billingAddress", value)}
                    />
                    {errors.billingAddress && (
                      <p className="text-xs text-destructive">{errors.billingAddress}</p>
                    )}
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
                      label="Shipping Address *"
                      value={form.shippingAddress}
                      onChange={(value) => update("shippingAddress", value)}
                      disabled={sameAsBilling}
                    />
                    {errors.shippingAddress && (
                      <p className="text-xs text-destructive">{errors.shippingAddress}</p>
                    )}
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
