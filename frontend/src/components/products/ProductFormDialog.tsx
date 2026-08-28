import { useEffect, useState, type FormEvent } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
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
import type { Product, ProductTechnicalSpec } from "@/types";
import type { ProductPayload } from "@/api/products";

// Techno-Commercial Offer PDF (branded Quotation template) — Annexure-I
// spec sheet fields, keyed exactly like ProductTechnicalSpec. Rendered as a
// flat list of labeled text inputs below; every value is optional free text
// (the PDF just leaves the cell blank), so there is no per-field validation.
const SPEC_FIELDS: { key: Exclude<keyof ProductTechnicalSpec, "scopeOfSupply">; label: string; placeholder?: string }[] = [
  { key: "modelNo", label: "Model No.", placeholder: "e.g. SPYRO 14" },
  { key: "fanSize", label: "Fan Size", placeholder: "e.g. 14 ft. (4.3 M)" },
  { key: "noOfBlades", label: "No. of Blades", placeholder: "e.g. 5 Nos." },
  { key: "airVolume", label: "Air Volume", placeholder: "e.g. 6650 CMM; (2,40,000 CFM)" },
  { key: "coverageArea", label: "Coverage Area", placeholder: "e.g. 3,848 ft²" },
  { key: "motorRating", label: "Motor Rating", placeholder: "e.g. 0.75 kw; (1 HP) IP 65" },
  { key: "speed", label: "Speed", placeholder: "e.g. 80 rpm" },
  { key: "noise", label: "Noise", placeholder: "e.g. <45db" },
  { key: "weight", label: "Weight (Approx.)", placeholder: "e.g. 105 kgs" },
  { key: "threePhaseVoltage", label: "3 Phase Drive – Vol (V)", placeholder: "e.g. 410" },
  { key: "threePhaseCurrent", label: "3 Phase Drive – Current (A)", placeholder: "e.g. 2.3" },
  { key: "onePhaseVoltage", label: "1 Phase Drive – Vol (V)", placeholder: "e.g. 235" },
  { key: "onePhaseCurrent", label: "1 Phase Drive – Current (A)", placeholder: "e.g. 7" },
  { key: "frequency", label: "Frequency (Hz)", placeholder: "e.g. 50/60" },
  { key: "frameStructure", label: "Frame Structure", placeholder: "e.g. M.S. (Powder Coated)" },
  { key: "hangingStructure", label: "Hanging Structure", placeholder: "e.g. M.S. (Powder Coated)" },
  { key: "fasteners", label: "Fasteners", placeholder: "e.g. High Tensile 10.9 Grade HEX Bolts" },
  { key: "bladeDesign", label: "Blade Design", placeholder: "e.g. Cambered Aerofoil Design" },
  { key: "bladeMoc", label: "Blade M.O.C.", placeholder: "e.g. Aluminium 6063 (Matte Silver Anodised)" },
  { key: "bladeSectionalWidth", label: "Blade Sectional Width", placeholder: "e.g. 160 mm" },
  { key: "driveType", label: "Drive Type", placeholder: "e.g. Direct Driven PMSM Type" },
  { key: "controlPanelMounting", label: "Control Panel – Mounting", placeholder: "e.g. Wall Mounting 3-5 Ft. from Floor Level" },
  { key: "controlPanelDrive", label: "Control Panel – PMSM Drive", placeholder: "e.g. CG Emotron / Veichi / Equ." },
  { key: "controlPanelEnclosure", label: "Control Panel – Enclosure", placeholder: "e.g. IP 43, Powder Coated Steel Cabinet" },
  { key: "bmsCompatibility", label: "BMS Compatibility", placeholder: "e.g. BMS Compatibility" },
  { key: "safetyCertification", label: "Safety Certification", placeholder: "e.g. Compliance to CE Requirements" },
  { key: "boltedJoints", label: "Bolted Joints", placeholder: "e.g. Self locking Nylock Nuts, SS Wire Rope wrapped" },
  { key: "warrantyMotor", label: "Warranty – Motor", placeholder: "e.g. 36 months from the date of erection" },
  { key: "warrantyDrive", label: "Warranty – Drive", placeholder: "e.g. 12 months from the date of erection" },
  { key: "warrantyOther", label: "Warranty – Other", placeholder: "e.g. 60 months from the date of erection" },
];

// scopeOfSupply is excluded here — it's an array (repeatable rows), handled
// separately by ScopeRow/scopeRows below, not a plain text field.
type SpecFormState = Partial<Record<Exclude<keyof ProductTechnicalSpec, "scopeOfSupply">, string>>;
type ScopeRow = { item: string; quantityPerFan: string };

// Drops blank fields/rows so a product nobody has filled in this section for
// simply sends technicalSpec: undefined rather than a JSON blob of empty
// strings.
function buildTechnicalSpec(
  spec: SpecFormState,
  scopeRows: ScopeRow[]
): ProductTechnicalSpec | undefined {
  const cleaned: SpecFormState = {};
  for (const { key } of SPEC_FIELDS) {
    const value = spec[key]?.trim();
    if (value) cleaned[key] = value;
  }
  const rows = scopeRows.filter((r) => r.item.trim() || r.quantityPerFan.trim());
  const result: ProductTechnicalSpec = { ...cleaned };
  if (rows.length > 0) result.scopeOfSupply = rows;
  return Object.keys(result).length > 0 ? result : undefined;
}

// Simple products (a standalone motor, a drive, a spare part) never need
// pricing-rule/technical-spec fields — most products won't. So that section
// stays collapsed by default and only auto-opens when editing a product that
// already has something in it, so existing data is never hidden by surprise.
function hasAdvancedData(p?: Product | null): boolean {
  if (!p) return false;
  if (p.standardPrice != null || p.minPrice != null || p.maxDiscountPercent != null) return true;
  const spec = p.technicalSpec;
  if (!spec) return false;
  return Object.keys(spec).length > 0;
}

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
  categories: string[];
  onSubmit: (payload: ProductPayload) => Promise<void>;
}

interface FormState {
  name: string;
  category: string;
  sku: string;
  price: string;
  description: string;
  // Free text noting which fan(s) a spare part (motor, drive, etc.) applies
  // to — e.g. "HVLS SPYRO 14" or "All HVLS Fans". Optional, kept in the
  // simple always-visible section since it's the main thing that
  // distinguishes one spare part from another.
  applicableTo: string;
  // Price Validation (requirement #8): Standard Price is what discount % is
  // measured against, Minimum Price is the hard floor a Quotation item may
  // never go below without an approval request, and Max Discount % is
  // informational context shown alongside them (the actual enforcement is
  // the Approval Matrix, configured separately).
  standardPrice: string;
  minPrice: string;
  maxDiscountPercent: string;
  spec: SpecFormState;
  scopeRows: ScopeRow[];
}

const emptyForm: FormState = {
  name: "",
  category: "",
  sku: "",
  price: "",
  description: "",
  applicableTo: "",
  standardPrice: "",
  minPrice: "",
  maxDiscountPercent: "",
  spec: {},
  scopeRows: [],
};

export default function ProductFormDialog({
  open,
  onOpenChange,
  product,
  categories,
  onSubmit,
}: ProductFormDialogProps) {
  const isEdit = !!product;
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Partial<FormState>>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (open) {
      setShowAdvanced(hasAdvancedData(product));
      setForm(
        product
          ? {
              name: product.name,
              category: product.category,
              sku: product.sku ?? "",
              price: product.price != null ? String(product.price) : "",
              description: product.description ?? "",
              applicableTo: product.applicableTo ?? "",
              standardPrice: product.standardPrice != null ? String(product.standardPrice) : "",
              minPrice: product.minPrice != null ? String(product.minPrice) : "",
              maxDiscountPercent:
                product.maxDiscountPercent != null ? String(product.maxDiscountPercent) : "",
              spec: (product.technicalSpec ?? {}) as SpecFormState,
              scopeRows: product.technicalSpec?.scopeOfSupply ?? [],
            }
          : emptyForm
      );
      setErrors({});
      setSubmitError("");
    }
  }, [open, product]);

  function validate(): boolean {
    const next: Partial<FormState> = {};

    if (!form.name.trim()) {
      next.name = "Product name is required";
    }
    if (!form.category.trim()) {
      next.category = "Category is required";
    }
    if (form.price.trim()) {
      const parsed = Number(form.price);
      if (Number.isNaN(parsed) || parsed < 0) {
        next.price = "Price must be a positive number";
      }
    }
    if (form.standardPrice.trim()) {
      const parsed = Number(form.standardPrice);
      if (Number.isNaN(parsed) || parsed < 0) {
        next.standardPrice = "Standard price must be a positive number";
      }
    }
    if (form.minPrice.trim()) {
      const parsed = Number(form.minPrice);
      if (Number.isNaN(parsed) || parsed < 0) {
        next.minPrice = "Minimum price must be a positive number";
      }
    }
    if (form.standardPrice.trim() && form.minPrice.trim() && Number(form.minPrice) > Number(form.standardPrice)) {
      next.minPrice = "Minimum price cannot be greater than the standard price";
    }
    if (form.maxDiscountPercent.trim()) {
      const parsed = Number(form.maxDiscountPercent);
      if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
        next.maxDiscountPercent = "Max discount % must be between 0 and 100";
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError("");
    if (!validate()) return;

    setSubmitting(true);
    try {
      await onSubmit({
        name: form.name.trim(),
        category: form.category.trim(),
        sku: form.sku.trim() || undefined,
        description: form.description.trim() || undefined,
        applicableTo: form.applicableTo.trim() || undefined,
        price: form.price.trim() ? Number(form.price) : undefined,
        standardPrice: form.standardPrice.trim() ? Number(form.standardPrice) : undefined,
        minPrice: form.minPrice.trim() ? Number(form.minPrice) : undefined,
        maxDiscountPercent: form.maxDiscountPercent.trim()
          ? Number(form.maxDiscountPercent)
          : undefined,
        technicalSpec: buildTechnicalSpec(form.spec, form.scopeRows),
      });
      toast.success(isEdit ? "Product updated successfully." : "Product created successfully.");
      onOpenChange(false);
    } catch {
      setSubmitError("Something went wrong. Please try again.");
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Product" : "Add Product"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this product's details below."
              : "Name, category and price are all you need for a spare part like a motor or drive. Add pricing rules or fan spec sheets below only if this product needs them."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Product Name *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Input
                id="category"
                list="product-categories"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="e.g. HVLS Fans, BMS, IoT"
              />
              <datalist id="product-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              {errors.category && (
                <p className="text-xs text-destructive">{errors.category}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="sku">SKU / Model Code</Label>
              <Input
                id="sku"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="applicableTo">Applicable To</Label>
            <Input
              id="applicableTo"
              value={form.applicableTo}
              onChange={(e) => setForm({ ...form, applicableTo: e.target.value })}
              placeholder="e.g. HVLS SPYRO 14, All HVLS Fans"
            />
            <p className="text-xs text-muted-foreground">
              For a spare part (motor, drive, etc.) sold on its own — which fan(s) it applies to.
              Leave blank for a standalone product like a fan itself.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="price">Price</Label>
            <Input
              id="price"
              inputMode="decimal"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              placeholder="e.g. 125000"
            />
            {errors.price && <p className="text-xs text-destructive">{errors.price}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional details about this product or service"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex w-full items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            {showAdvanced ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            Pricing rules &amp; technical specifications (optional)
          </button>
          {!showAdvanced && (
            <p className="-mt-2 text-xs text-muted-foreground">
              Only needed for fan quotations with an Annexure-I spec sheet, or products with
              approval-matrix pricing rules. Skip this for spare parts.
            </p>
          )}

          {showAdvanced && (
          <>
          <div className="rounded-md border bg-slate-50 p-3">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Price Validation (Quotation approval)
            </p>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="standardPrice">Standard Price</Label>
                <Input
                  id="standardPrice"
                  inputMode="decimal"
                  value={form.standardPrice}
                  onChange={(e) => setForm({ ...form, standardPrice: e.target.value })}
                  placeholder="e.g. 125000"
                />
                {errors.standardPrice && (
                  <p className="text-xs text-destructive">{errors.standardPrice}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="minPrice">Minimum Price</Label>
                <Input
                  id="minPrice"
                  inputMode="decimal"
                  value={form.minPrice}
                  onChange={(e) => setForm({ ...form, minPrice: e.target.value })}
                  placeholder="e.g. 110000"
                />
                {errors.minPrice && <p className="text-xs text-destructive">{errors.minPrice}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxDiscountPercent">Max Discount %</Label>
                <Input
                  id="maxDiscountPercent"
                  inputMode="decimal"
                  value={form.maxDiscountPercent}
                  onChange={(e) => setForm({ ...form, maxDiscountPercent: e.target.value })}
                  placeholder="e.g. 10"
                />
                {errors.maxDiscountPercent && (
                  <p className="text-xs text-destructive">{errors.maxDiscountPercent}</p>
                )}
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Selling below Minimum Price blocks a quotation from being accepted until the price
              is fixed or an approval is requested. Standard Price is what the Approval Matrix
              measures discount % against; Max Discount % is shown for reference only.
            </p>
          </div>

          <div className="rounded-md border bg-slate-50 p-3">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Techno-Commercial Offer PDF — Technical Specifications
            </p>
            <p className="mb-3 text-xs text-muted-foreground">
              Fills the Annexure-I spec table on this fan size's Quotation PDF. Leave anything
              blank if it doesn't apply — the PDF just shows an empty cell.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {SPEC_FIELDS.map(({ key, label, placeholder }) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={`spec-${key}`} className="text-xs">
                    {label}
                  </Label>
                  <Input
                    id={`spec-${key}`}
                    value={form.spec[key] ?? ""}
                    onChange={(e) =>
                      setForm({ ...form, spec: { ...form.spec, [key]: e.target.value } })
                    }
                    placeholder={placeholder}
                  />
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Standard Scope of Supply</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setForm({
                      ...form,
                      scopeRows: [...form.scopeRows, { item: "", quantityPerFan: "" }],
                    })
                  }
                >
                  <Plus className="mr-1 h-3 w-3" /> Add Item
                </Button>
              </div>
              {form.scopeRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No scope-of-supply items yet (e.g. Hanging Pipe — 01 No., Blades — 05 Nos.).
                </p>
              ) : (
                <div className="space-y-2">
                  {form.scopeRows.map((row, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={row.item}
                        onChange={(e) => {
                          const next = [...form.scopeRows];
                          next[index] = { ...next[index], item: e.target.value };
                          setForm({ ...form, scopeRows: next });
                        }}
                        placeholder="Item (e.g. Hanging Pipe)"
                        className="flex-1"
                      />
                      <Input
                        value={row.quantityPerFan}
                        onChange={(e) => {
                          const next = [...form.scopeRows];
                          next[index] = { ...next[index], quantityPerFan: e.target.value };
                          setForm({ ...form, scopeRows: next });
                        }}
                        placeholder="Qty / Fan (e.g. 01 No.)"
                        className="w-40"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setForm({
                            ...form,
                            scopeRows: form.scopeRows.filter((_, i) => i !== index),
                          })
                        }
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          </>
          )}

          {submitError && <p className="text-sm text-destructive">{submitError}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Spinner className="mr-2 h-4 w-4" />}
              {submitting ? "Saving..." : isEdit ? "Save Changes" : "Add Product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
