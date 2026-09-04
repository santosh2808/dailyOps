import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { isPastDateInputValue, todayDateInputValue } from "@/lib/date";
import CustomerSelect from "@/components/quotations/CustomerSelect";
import QuotationItemsEditor, {
  computeSubtotal,
  isFanProduct,
} from "@/components/quotations/QuotationItemsEditor";
import ConfirmPriceIncludesChargesDialog from "@/components/quotations/ConfirmPriceIncludesChargesDialog";
import { Select } from "@/components/ui/select";
import {
  createQuotation,
  getQuotation,
  updateQuotation,
  type QuotationItemPayload,
  type QuotationPayload,
} from "@/api/quotations";
import { listProducts } from "@/api/products";
import type { Product, QuotationCommercialTerms, TransportScope } from "@/types";

interface FormState {
  customerId: string;
  gstPercent: string;
  // Real currency amounts (added into grandTotal). Blank means "let the
  // backend decide": installationCharge auto-computes to Rs.8,000 x total
  // fan quantity, transportationCharge defaults to 0. Non-blank always
  // overrides that default.
  installationCharge: string;
  transportationCharge: string;
  // Additive: who arranges transport — CUSTOMER_SCOPE hides/zeroes the
  // Transportation Charge field below. See Quotation.transportScope.
  transportScope: TransportScope;
  // Additive: set via ConfirmPriceIncludesChargesDialog when staff confirm
  // a raised item price already includes installation/transportation/GST —
  // see Quotation.pricesIncludeChargesAndGst.
  pricesIncludeChargesAndGst: boolean;
  validUntil: string;
  notes: string;
  terms: string;
  commercialTerms: Record<keyof QuotationCommercialTerms, string>;
}

const INSTALLATION_RATE_PER_FAN = 8000;

// Lead Management Phase 1 (requirement #9) — a quotation generated from a
// Lead has no Customer yet, so Edit must not require/overwrite customerId
// for one. Tracked outside FormState since it's never user-editable here.

// Techno-Commercial Offer PDF (branded Quotation template) — Annexure-II
// commercial terms turned out to genuinely vary order to order (GST
// Included/Extra, transportation, payment split, delivery window, offer
// validity...). These defaults mirror QuotationPdfService's own fallback
// values exactly, so a brand-new quotation's form shows what would actually
// print on the PDF if nothing here is touched — not blank fields that then
// silently render as something else.
const COMMERCIAL_TERMS_DEFAULTS: Record<keyof QuotationCommercialTerms, string> = {
  regionCode: "",
  priceBasis: "Ex-Works, Hyderabad",
  installationCharge: "Rs.8,000 per fan",
  transportation: "Extra at actual",
  gstTerms: "Included",
  packingForwarding: "Included",
  transportInsurance: "To your account",
  unloading: "",
  payment: "100% advance along with the Purchase order.",
  delivery: "7-10 days from the date of PO / release of advance.",
  installationSchedule: "",
  offerValidity: "90 days from the date of offer",
};

const COMMERCIAL_TERMS_FIELDS: { key: keyof QuotationCommercialTerms; label: string; placeholder?: string; optional?: boolean }[] = [
  { key: "regionCode", label: "Region / Branch Code", placeholder: "e.g. NCR (leave blank for none)" },
  { key: "priceBasis", label: "Price Basis", placeholder: "e.g. Ex-Works, Hyderabad" },
  { key: "installationCharge", label: "Installation — wording only (see Installation Charge ₹ field above)", placeholder: "e.g. Rs.8,000 per fan" },
  { key: "transportation", label: "Transportation — wording only (see Transportation Charge ₹ field above)", placeholder: "e.g. Extra at actual" },
  { key: "gstTerms", label: "GST", placeholder: "e.g. Included / Extra" },
  { key: "packingForwarding", label: "Packing & Forwarding", placeholder: "e.g. Included" },
  { key: "transportInsurance", label: "Transport Insurance", placeholder: "e.g. To your account" },
  { key: "unloading", label: "Unloading at site (optional line)", placeholder: "Leave blank to omit this line entirely", optional: true },
  { key: "payment", label: "Payment", placeholder: "e.g. 100% advance along with the Purchase order." },
  { key: "delivery", label: "Delivery", placeholder: "e.g. 7-10 days from the date of PO / release of advance." },
  { key: "installationSchedule", label: "Installation schedule (optional line)", placeholder: "Leave blank to omit this line entirely", optional: true },
  { key: "offerValidity", label: "Offer Validity", placeholder: "e.g. 90 days from the date of offer" },
];

const emptyForm: FormState = {
  customerId: "",
  gstPercent: "18",
  installationCharge: "",
  transportationCharge: "",
  transportScope: "COMPANY_SCOPE",
  pricesIncludeChargesAndGst: false,
  validUntil: "",
  notes: "",
  terms: "",
  commercialTerms: { ...COMMERCIAL_TERMS_DEFAULTS },
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

// Trims every field; drops anything blank (the backend/PDF renderer falls
// back to its own defaults for a missing field anyway, and unloading/
// installationSchedule specifically need to be genuinely absent — not an
// empty string — to be omitted from the PDF).
function buildCommercialTermsPayload(
  terms: Record<keyof QuotationCommercialTerms, string>
): QuotationCommercialTerms | undefined {
  const result: QuotationCommercialTerms = {};
  for (const { key } of COMMERCIAL_TERMS_FIELDS) {
    const value = terms[key]?.trim();
    if (value) result[key] = value;
  }
  return Object.keys(result).length > 0 ? result : undefined;
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
  // Lead-sourced quotation being edited — no Customer field to show/require,
  // and the Customer must never be overwritten by this form.
  const [leadOrigin, setLeadOrigin] = useState<{ id: string; companyName: string; contactPerson: string } | null>(
    null,
  );
  const [priceDialogOpen, setPriceDialogOpen] = useState(false);
  const [priceDialogProductName, setPriceDialogProductName] = useState("");
  // Lifted up from QuotationItemsEditor (which used to fetch this itself)
  // so validate() below can also check each item's product — specifically
  // whether it's a fan (populated technicalSpec) and therefore requires a
  // confirmed Color choice, not just QuotationItemsEditor's own rendering.
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [catalogError, setCatalogError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadCatalog() {
      try {
        const res = await listProducts({ page: 1, limit: 100 });
        if (!cancelled) setCatalog(res.data);
      } catch {
        if (!cancelled) {
          setCatalogError("Could not load the product catalog.");
          toast.error("Could not load the product catalog.");
        }
      }
    }
    loadCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isEdit || !id) return;
    const quotationId = id;
    let cancelled = false;
    async function loadQuotation() {
      setLoading(true);
      try {
        const quotation = await getQuotation(quotationId);
        if (cancelled) return;
        // Only show installationCharge as an explicit value if it doesn't
        // match what auto-compute would already give for this quotation's
        // current items — i.e. it was deliberately overridden. Otherwise
        // leave the field blank so it keeps auto-recalculating if items are
        // edited, instead of freezing today's amount as a stale override.
        const loadedQty = (quotation.items ?? []).reduce((sum, item) => sum + item.quantity, 0);
        const autoInstallation = INSTALLATION_RATE_PER_FAN * loadedQty;
        const installationCharge =
          quotation.installationCharge !== autoInstallation ? String(quotation.installationCharge ?? "") : "";
        setForm({
          customerId: quotation.customerId ?? "",
          gstPercent: String(quotation.gstPercent),
          installationCharge,
          // transportationCharge has no auto-compute, so always show the
          // real stored value (0 just means "not filled in yet").
          transportationCharge: quotation.transportationCharge ? String(quotation.transportationCharge) : "",
          transportScope: quotation.transportScope ?? "COMPANY_SCOPE",
          pricesIncludeChargesAndGst: quotation.pricesIncludeChargesAndGst ?? false,
          validUntil: toDateInputValue(quotation.validUntil),
          notes: quotation.notes ?? "",
          terms: quotation.terms ?? "",
          commercialTerms: {
            ...COMMERCIAL_TERMS_DEFAULTS,
            ...(Object.fromEntries(
              Object.entries(quotation.commercialTerms ?? {}).filter(([, v]) => v != null)
            ) as Partial<Record<keyof QuotationCommercialTerms, string>>),
          },
        });
        setLeadOrigin(
          quotation.leadId && quotation.lead
            ? {
                id: quotation.leadId,
                companyName: quotation.lead.companyName,
                contactPerson: quotation.lead.contactPerson,
              }
            : null,
        );
        setItems(
          (quotation.items ?? []).map((item) => ({
            productId: item.productId,
            description: item.description ?? undefined,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            color: item.color ?? undefined,
            colorCharge: item.colorCharge,
            hangingStructureType: item.hangingStructureType ?? undefined,
            pipeLength: item.pipeLength ?? undefined,
            hangingStructureCharge: item.hangingStructureCharge,
          }))
        );
      } catch {
        const message = "Could not load this quotation.";
        setSubmitError(message);
        toast.error(message);
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

  function updateCommercialTerm(key: keyof QuotationCommercialTerms, value: string) {
    setForm((f) => ({ ...f, commercialTerms: { ...f.commercialTerms, [key]: value } }));
  }

  // Fired by QuotationItemsEditor when a row's unit price is raised above
  // the product's own catalog price — skip re-asking if already marked
  // included, since re-confirming every edit would get tedious.
  function handleUnitPriceAboveBase(productName: string) {
    if (form.pricesIncludeChargesAndGst) return;
    setPriceDialogProductName(productName);
    setPriceDialogOpen(true);
  }

  function handlePriceDialogAnswer(includesChargesAndGst: boolean) {
    setForm((f) => ({
      ...f,
      pricesIncludeChargesAndGst: includesChargesAndGst,
      // "Remove that price cost in quotation" — clear the separate charge
      // fields once they're confirmed to already be folded into item
      // prices, so the (now-hidden) inputs don't leave a stale override.
      ...(includesChargesAndGst ? { installationCharge: "", transportationCharge: "" } : {}),
    }));
  }

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> & { items?: string } = {};

    if (!leadOrigin && !form.customerId) next.customerId = "Customer is required";
    if (items.length === 0) {
      next.items = "Add at least one item";
    } else {
      const catalogById = new Map(catalog.map((p) => [p.id, p]));
      const missingColor = items.some(
        (item) => isFanProduct(catalogById.get(item.productId)) && !item.color?.trim(),
      );
      if (missingColor) {
        next.items = "Pick a Color for every fan item before saving — ask the customer which color they want.";
      }
    }
    if (form.gstPercent.trim()) {
      const parsed = Number(form.gstPercent);
      if (Number.isNaN(parsed) || parsed < 0) {
        next.gstPercent = "GST percent must be a positive number";
      }
    }
    if (form.installationCharge.trim()) {
      const parsed = Number(form.installationCharge);
      if (Number.isNaN(parsed) || parsed < 0) {
        next.installationCharge = "Installation charge must be a positive number";
      }
    }
    if (form.transportationCharge.trim()) {
      const parsed = Number(form.transportationCharge);
      if (Number.isNaN(parsed) || parsed < 0) {
        next.transportationCharge = "Transportation charge must be a positive number";
      }
    }
    // A quotation can't be valid until a date that's already passed.
    if (isPastDateInputValue(form.validUntil)) {
      next.validUntil = "Valid Until cannot be before today";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError("");
    if (!validate()) return;

    const payload: QuotationPayload = {
      // Never send customerId for a lead-sourced quotation — leaving it out
      // of the PATCH means the backend's update() leaves it untouched.
      customerId: leadOrigin ? undefined : form.customerId,
      items,
      gstPercent: form.gstPercent.trim() ? Number(form.gstPercent) : undefined,
      // Blank means "let the backend decide" (auto-compute installation
      // from quantity; default transportation to 0) — never send 0/NaN for
      // an untouched field.
      installationCharge: form.installationCharge.trim() ? Number(form.installationCharge) : undefined,
      transportationCharge: form.transportationCharge.trim() ? Number(form.transportationCharge) : undefined,
      transportScope: form.transportScope,
      pricesIncludeChargesAndGst: form.pricesIncludeChargesAndGst,
      validUntil: form.validUntil || undefined,
      notes: form.notes.trim() || undefined,
      terms: form.terms.trim() || undefined,
      commercialTerms: buildCommercialTermsPayload(form.commercialTerms),
    };

    setSubmitting(true);
    try {
      if (isEdit && id) {
        await updateQuotation(id, payload);
        toast.success("Quotation updated successfully.");
        navigate(`/quotations/${id}`);
      } else {
        const created = await createQuotation(payload);
        toast.success("Quotation created successfully.");
        navigate(`/quotations/${created.id}`);
      }
    } catch {
      const message = "Something went wrong while saving this quotation. Please try again.";
      setSubmitError(message);
      toast.error(message);
      setSubmitting(false);
    }
  }

  const subtotal = computeSubtotal(items);
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const autoInstallationCharge = INSTALLATION_RATE_PER_FAN * totalQuantity;
  const gstPercentNum = form.gstPercent.trim() ? Number(form.gstPercent) || 0 : 0;
  // Mirrors QuotationsService.computeTotals(): once staff confirm item
  // prices already include installation/transportation/GST, those charges
  // drop to 0 and GST is shown as the amount already embedded in the
  // subtotal (back-calculated) instead of added on top.
  const installationChargeNum = form.pricesIncludeChargesAndGst
    ? 0
    : form.installationCharge.trim()
      ? Number(form.installationCharge) || 0
      : autoInstallationCharge;
  const transportationChargeNum = form.pricesIncludeChargesAndGst
    ? 0
    : form.transportScope === "CUSTOMER_SCOPE"
      ? 0
      : form.transportationCharge.trim()
        ? Number(form.transportationCharge) || 0
        : 0;
  const gstAmount = form.pricesIncludeChargesAndGst
    ? subtotal - subtotal / (1 + gstPercentNum / 100)
    : (subtotal + installationChargeNum + transportationChargeNum) * (gstPercentNum / 100);
  const grandTotal = form.pricesIncludeChargesAndGst
    ? subtotal
    : subtotal + installationChargeNum + transportationChargeNum + gstAmount;

  return (
    <div className="flex h-screen bg-app-grid">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title={isEdit ? "Edit Quotation" : "Create Quotation"} />
        <main className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Loading quotation...
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="mx-auto max-w-4xl space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Customer</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {leadOrigin ? (
                    <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm">
                      <p className="font-medium text-slate-900">{leadOrigin.companyName}</p>
                      <p className="text-muted-foreground">{leadOrigin.contactPerson}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Generated from this Lead — no Customer record yet.
                      </p>
                    </div>
                  ) : (
                    <>
                      <Label htmlFor="customerId">Customer *</Label>
                      <CustomerSelect
                        id="customerId"
                        value={form.customerId}
                        onChange={(customerId) => update("customerId", customerId)}
                      />
                      {errors.customerId && (
                        <p className="text-xs text-destructive">{errors.customerId}</p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Items</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <QuotationItemsEditor
                    value={items}
                    onChange={setItems}
                    catalog={catalog}
                    catalogError={catalogError}
                    onUnitPriceAboveBase={handleUnitPriceAboveBase}
                  />
                  {errors.items && <p className="text-xs text-destructive">{errors.items}</p>}

                  {form.pricesIncludeChargesAndGst && (
                    <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                      Item prices on this quotation already include installation, transportation,
                      and GST — those are not added separately below.{" "}
                      <button
                        type="button"
                        className="font-medium underline"
                        onClick={() => update("pricesIncludeChargesAndGst", false)}
                      >
                        Undo — charge them separately instead
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                        min={todayDateInputValue()}
                        value={form.validUntil}
                        onChange={(e) => update("validUntil", e.target.value)}
                      />
                      {errors.validUntil && (
                        <p className="text-xs text-destructive">{errors.validUntil}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="transportScope">Transport Scope</Label>
                      <Select
                        id="transportScope"
                        value={form.transportScope}
                        onChange={(e) => update("transportScope", e.target.value as TransportScope)}
                      >
                        <option value="COMPANY_SCOPE">Company Scope — we arrange &amp; charge transport</option>
                        <option value="CUSTOMER_SCOPE">Customer Scope — customer arranges their own transport</option>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Customer Scope hides/zeroes the Transportation Charge below — no transport
                        is billed on this quotation.
                      </p>
                    </div>

                    {!form.pricesIncludeChargesAndGst && (
                      <div className="space-y-2">
                        <Label htmlFor="installationCharge">Installation Charge (₹)</Label>
                        <Input
                          id="installationCharge"
                          inputMode="decimal"
                          value={form.installationCharge}
                          onChange={(e) => update("installationCharge", e.target.value)}
                          placeholder={`Auto: ${formatCurrency(autoInstallationCharge)} (₹8,000 × ${totalQuantity} fan${totalQuantity === 1 ? "" : "s"})`}
                        />
                        <p className="text-xs text-muted-foreground">
                          Leave blank to auto-calculate at ₹8,000 per fan. Only fill this in to
                          override that rate for this quotation.
                        </p>
                        {errors.installationCharge && (
                          <p className="text-xs text-destructive">{errors.installationCharge}</p>
                        )}
                      </div>
                    )}

                    {!form.pricesIncludeChargesAndGst && form.transportScope !== "CUSTOMER_SCOPE" && (
                      <div className="space-y-2">
                        <Label htmlFor="transportationCharge">Transportation Charge (₹)</Label>
                        <Input
                          id="transportationCharge"
                          inputMode="decimal"
                          value={form.transportationCharge}
                          onChange={(e) => update("transportationCharge", e.target.value)}
                          placeholder="Enter based on delivery location"
                        />
                        <p className="text-xs text-muted-foreground">
                          No default — varies by site/distance. Leave blank until known (treated
                          as ₹0 until filled in).
                        </p>
                        {errors.transportationCharge && (
                          <p className="text-xs text-destructive">{errors.transportationCharge}</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-2 rounded-md border bg-slate-50 p-4 text-sm sm:grid-cols-5">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Subtotal</p>
                      <p className="font-medium text-slate-900">{formatCurrency(subtotal)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Installation</p>
                      <p className="font-medium text-slate-900">
                        {form.pricesIncludeChargesAndGst ? "Included" : formatCurrency(installationChargeNum)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Transportation</p>
                      <p className="font-medium text-slate-900">
                        {form.pricesIncludeChargesAndGst
                          ? "Included"
                          : form.transportScope === "CUSTOMER_SCOPE"
                            ? "By Customer"
                            : formatCurrency(transportationChargeNum)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        GST ({gstPercentNum || 0}%){form.pricesIncludeChargesAndGst ? " — Included" : ""}
                      </p>
                      <p className="font-medium text-slate-900">{formatCurrency(gstAmount)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Grand Total</p>
                      <p className="font-semibold text-slate-900">{formatCurrency(grandTotal)}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Subtotal, Installation, Transportation, GST, and Grand Total shown above are a
                    live preview — the backend recalculates these from the submitted values when
                    you save.
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

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Commercial Terms (Quotation PDF — Annexure II)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    These print on the branded Quotation PDF. Pre-filled with the usual terms —
                    change anything that's different for this customer before sending. The two
                    "optional line" fields are left off the PDF entirely when blank.
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {COMMERCIAL_TERMS_FIELDS.map(({ key, label, placeholder }) => (
                      <div key={key} className="space-y-1">
                        <Label htmlFor={`ct-${key}`} className="text-xs">
                          {label}
                        </Label>
                        <Input
                          id={`ct-${key}`}
                          value={form.commercialTerms[key]}
                          onChange={(e) => updateCommercialTerm(key, e.target.value)}
                          placeholder={placeholder}
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {submitError && <p className="text-sm text-destructive">{submitError}</p>}

              <div className="flex justify-end gap-2 pb-6">
                <Button type="button" variant="outline" onClick={() => navigate(-1)} disabled={submitting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Spinner className="mr-2 h-4 w-4" />}
                  {submitting ? "Saving..." : isEdit ? "Save Changes" : "Save Draft"}
                </Button>
              </div>
            </form>
          )}
        </main>
      </div>
      <ConfirmPriceIncludesChargesDialog
        open={priceDialogOpen}
        onOpenChange={setPriceDialogOpen}
        productName={priceDialogProductName}
        onAnswer={handlePriceDialogAnswer}
      />
    </div>
  );
}
