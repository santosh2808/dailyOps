import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HANGING_STRUCTURE_OPTIONS } from "@/components/job-execution-orders/jeoOptions";
import {
  FREE_PAINT_COLORS,
  PAINT_COLOR_OPTIONS,
  STANDARD_PAINT_EXTRA_CHARGE,
  colorSelectValue,
} from "@/components/quotations/quotationOptions";
import type { QuotationItemPayload } from "@/api/quotations";
import type { HangingStructureType, Product } from "@/types";

interface QuotationItemsEditorProps {
  value: QuotationItemPayload[];
  onChange: (value: QuotationItemPayload[]) => void;
  // Lifted up to QuotationForm.tsx (rather than fetched here) so the form's
  // own validate() can also check each item's product — specifically
  // whether it's a fan (has a populated technicalSpec) and therefore
  // requires a Color choice. See isFanProduct() below.
  catalog: Product[];
  catalogError?: string;
  // Additive: fired when staff raise a row's unit price above the product's
  // own catalog price — QuotationForm.tsx uses this to prompt whether the
  // higher price already includes installation/transportation/GST (see
  // ConfirmPriceIncludesChargesDialog). Fires on blur, not on every
  // keystroke, so it doesn't nag mid-edit.
  onUnitPriceAboveBase?: (productName: string) => void;
  // QA bug-fix pass (TC-084): the per-row "Color is required" message used
  // to render unconditionally the moment a fan row's color was empty, even
  // on a row the user had just added and hadn't touched yet — reads as the
  // form yelling at you before you've done anything wrong. Gated on this
  // (true only once QuotationForm.tsx's handleSubmit has actually been
  // attempted, same as its own top-level errors.items message), so it only
  // shows after a real save attempt. Defaults to false so this component
  // still behaves sensibly if a future caller doesn't pass it.
  attemptedSubmit?: boolean;
}

// Mirrors the backend's QuotationPdfService.hasPopulatedSpec() — a product
// only counts as "a fan" (and therefore needs a confirmed paint Color) once
// someone has filled in its technical spec sheet in Add/Edit Product. A
// spare part (motor, drive, etc.) is deliberately left blank there.
export function isFanProduct(product?: Product): boolean {
  return !!product?.technicalSpec && Object.keys(product.technicalSpec).length > 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

// Live client-side preview only — the backend always recalculates line
// totals, subtotal, GST, and grand total from the submitted items, so this
// never needs to be the source of truth.
export function lineTotal(item: QuotationItemPayload) {
  // Color/hanging-structure charges are a per-unit (per-fan) rate, scaled by
  // quantity just like unitPrice — mirrors QuotationsService.computeTotals().
  return (
    item.quantity * ((item.unitPrice ?? 0) + (item.colorCharge ?? 0) + (item.hangingStructureCharge ?? 0))
  );
}

export function computeSubtotal(items: QuotationItemPayload[]) {
  return items.reduce((sum, item) => sum + lineTotal(item), 0);
}

// Multiple quotation items, each tied to a Product, with quantity and unit
// price (auto-filled from the catalog, editable). Mirrors the structure of
// LeadProductsSelector so the two multi-line editors stay visually
// consistent across the app.
export default function QuotationItemsEditor({
  value,
  onChange,
  catalog,
  catalogError,
  onUnitPriceAboveBase,
  attemptedSubmit = false,
}: QuotationItemsEditorProps) {
  const [pendingProductId, setPendingProductId] = useState("");
  // QA bug-fix pass (TC-070): colorSelectValue() can't tell "no color
  // chosen yet" apart from "Custom was chosen but the free-text box is
  // still empty" — both are just `row.color === ""`. That collapse used to
  // make the dropdown snap back to "Select a color..." and the free-text
  // box disappear entirely the instant someone picked "Custom / Other,"
  // with no way to type anything. Tracked here per-row (keyed by the
  // stable productId, not array index, so it survives another row being
  // added/removed above it) as UI-only state layered on top of the
  // still-just-a-string row.color — no new field needed on the wire.
  const [customColorProductIds, setCustomColorProductIds] = useState<Set<string>>(new Set());

  function setCustomColorMode(productId: string, isCustom: boolean) {
    setCustomColorProductIds((prev) => {
      const next = new Set(prev);
      if (isCustom) next.add(productId);
      else next.delete(productId);
      return next;
    });
  }

  // QA bug-fix pass (TC-090): the main row used to show every field
  // (including Description) inline, which crowded it on narrower screens.
  // Description now lives in a per-row expandable detail area instead —
  // same Set<string>-keyed-by-productId convention as
  // customColorProductIds above, so it survives rows being added/removed
  // above it. Rows that already have a Description filled in (loaded from
  // a saved quotation) start expanded so existing data is never hidden by
  // surprise — mirrors ProductFormDialog's hasAdvancedData() auto-open.
  const [expandedRows, setExpandedRows] = useState<Set<string>>(
    () => new Set(value.filter((row) => row.description?.trim()).map((row) => row.productId)),
  );

  function toggleExpanded(productId: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  const productMap = useMemo(() => new Map(catalog.map((p) => [p.id, p])), [catalog]);

  function addProduct() {
    if (!pendingProductId) return;
    // Bug fix: adding a product that's already on this quotation used to
    // append a second, separate line for the same product instead of just
    // bumping its quantity — two rows both showing "SPYRO Fan 1400mm" reads
    // as a mistake and doubles up the color/hanging-structure inputs too.
    // Combine into the existing row's quantity instead, matching how a
    // customer actually orders "2 of this fan," not two half-configured
    // lines for the same item.
    const existingIndex = value.findIndex((row) => row.productId === pendingProductId);
    if (existingIndex !== -1) {
      onChange(
        value.map((row, i) =>
          i === existingIndex ? { ...row, quantity: (row.quantity ?? 0) + 1 } : row,
        ),
      );
      setPendingProductId("");
      return;
    }
    const product = productMap.get(pendingProductId);
    onChange([
      ...value,
      {
        productId: pendingProductId,
        description: "",
        quantity: 1,
        unitPrice: product?.price ?? 0,
      },
    ]);
    setPendingProductId("");
  }

  function updateRow(index: number, patch: Partial<QuotationItemPayload>) {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    const removedProductId = value[index]?.productId;
    onChange(value.filter((_, i) => i !== index));
    if (removedProductId) {
      setCustomColorMode(removedProductId, false);
      setExpandedRows((prev) => {
        if (!prev.has(removedProductId)) return prev;
        const next = new Set(prev);
        next.delete(removedProductId);
        return next;
      });
    }
  }

  return (
    <div className="space-y-3">
      <Label>Quotation Items</Label>

      <div className="flex gap-2">
        <Select
          value={pendingProductId}
          onChange={(e) => setPendingProductId(e.target.value)}
          className="max-w-sm"
        >
          <option value="">Select a product to add...</option>
          {catalog.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.category})
            </option>
          ))}
        </Select>
        <Button type="button" variant="outline" onClick={addProduct} disabled={!pendingProductId}>
          <Plus className="mr-1 h-4 w-4" />
          Add Item
        </Button>
      </div>

      {catalogError && <p className="text-xs text-destructive">{catalogError}</p>}

      {value.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Product</TableHead>
              <TableHead className="w-24">Qty</TableHead>
              <TableHead className="w-32">Unit Price</TableHead>
              <TableHead className="w-32">Line Total</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {value.map((row, index) => {
              const product = productMap.get(row.productId);
              const basePrice = product?.price ?? 0;
              const isExpanded = expandedRows.has(row.productId);
              return (
                <Fragment key={`${row.productId}-${index}`}>
                  <TableRow>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleExpanded(row.productId)}
                        aria-label={isExpanded ? "Collapse row details" : "Expand row details"}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium text-slate-900">
                      {product?.name ?? "Unknown product"}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        value={row.quantity}
                        onChange={(e) => updateRow(index, { quantity: Number(e.target.value) || 1 })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        // TC-092: only affects the native up/down arrow
                        // increment — typing any exact rupee amount (not a
                        // multiple of 10,000) still works and saves as
                        // typed, since onChange below just takes
                        // Number(e.target.value) as-is.
                        step={10000}
                        value={row.unitPrice ?? ""}
                        onChange={(e) =>
                          updateRow(index, {
                            unitPrice: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                        onBlur={(e) => {
                          const newPrice = e.target.value ? Number(e.target.value) : undefined;
                          if (newPrice !== undefined && basePrice > 0 && newPrice > basePrice) {
                            onUnitPriceAboveBase?.(product?.name ?? "this product");
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-slate-700">{formatCurrency(lineTotal(row))}</TableCell>
                    <TableCell>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(index)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {/* QA bug-fix pass (TC-090): Description used to be its own
                      always-visible column on the main row, crowding it —
                      now it's in this row's expandable detail area instead,
                      toggled by the chevron button above. Still fully
                      editable, just not permanently taking up column width. */}
                  {isExpanded && (
                    <TableRow>
                      <TableCell colSpan={6} className="bg-slate-50 py-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Description</Label>
                          <Input
                            value={row.description ?? ""}
                            onChange={(e) => updateRow(index, { description: e.target.value })}
                            placeholder="Optional"
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  {/* Color / Hanging Structure — always visible per item, not
                      hidden behind a toggle, so it isn't easy to miss. */}
                  <TableRow>
                    <TableCell colSpan={6} className="bg-slate-50 py-3">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Color / Hanging Structure {isFanProduct(product) ? "" : "(optional, priced separately)"}
                      </p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
                        <div className="space-y-1">
                          <Label className="text-xs">
                            Color{isFanProduct(product) ? " *" : ""}
                          </Label>
                          <Select
                            // QA bug-fix pass (TC-070): show "Custom" as
                            // selected whenever this row is in custom mode
                            // (tracked above), not just when row.color
                            // happens to already hold a non-fixed value —
                            // otherwise picking "Custom / Other" with an
                            // empty free-text box made the dropdown snap
                            // straight back to "Select a color...".
                            value={
                              customColorProductIds.has(row.productId)
                                ? "CUSTOM"
                                : colorSelectValue(row.color)
                            }
                            onChange={(e) => {
                              const selected = e.target.value;
                              // Only Aluminium/Orange are free — every other
                              // fixed color (Black/White/Grey) and Custom all
                              // carry the same "specific paint" extra charge
                              // (see the Quotation PDF's own Exclusions
                              // line), so they're treated identically here.
                              const isFree = FREE_PAINT_COLORS.has(selected);
                              setCustomColorMode(row.productId, selected === "CUSTOM");
                              updateRow(index, {
                                // Picking a fixed color stores it directly;
                                // picking Custom clears the field so the
                                // free-text box below starts blank instead
                                // of showing a stale fixed-color value — the
                                // box now stays visible while empty because
                                // of the custom-mode tracking above, instead
                                // of disappearing.
                                color: selected === "CUSTOM" ? "" : selected || undefined,
                                // Pre-fill the extra charge the moment a
                                // non-free color is picked, still editable.
                                // Switching to Aluminium/Orange clears it.
                                colorCharge: !selected
                                  ? row.colorCharge
                                  : isFree
                                    ? 0
                                    : row.colorCharge || STANDARD_PAINT_EXTRA_CHARGE,
                              });
                            }}
                          >
                            <option value="">Select a color...</option>
                            {PAINT_COLOR_OPTIONS.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.label}
                              </option>
                            ))}
                          </Select>
                          {(customColorProductIds.has(row.productId) ||
                            colorSelectValue(row.color) === "CUSTOM") && (
                            <Input
                              value={row.color ?? ""}
                              onChange={(e) => {
                                // Also flips this row into custom mode on
                                // its own: otherwise editing an *existing*
                                // custom color (loaded from a saved
                                // quotation, so customColorProductIds never
                                // got set for it) down to an empty string
                                // would hit the exact same disappearing-box
                                // bug this fix is for — colorSelectValue("")
                                // reverts to "no selection" the moment the
                                // text is cleared.
                                setCustomColorMode(row.productId, true);
                                updateRow(index, { color: e.target.value });
                              }}
                              placeholder="e.g. Custom RAL 9016 White"
                              className="mt-1"
                            />
                          )}
                          {(customColorProductIds.has(row.productId) || colorSelectValue(row.color)) &&
                            !FREE_PAINT_COLORS.has(row.color?.trim() ?? "") && (
                              // QA bug-fix pass (TC-068): this line was
                              // overflowing its column on narrow/mobile
                              // widths instead of wrapping — break-words
                              // lets it wrap onto multiple lines like the
                              // other helper text in this form does.
                              <p className="text-xs text-muted-foreground break-words">
                                Only Aluminium and Orange are free — this color carries an extra charge (see Color Charge).
                              </p>
                            )}
                          {attemptedSubmit && isFanProduct(product) && !row.color?.trim() && (
                            <p className="text-xs text-destructive">Required — ask the customer which color they want.</p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Color Charge (₹)</Label>
                          <Input
                            type="number"
                            min={0}
                            // QA bug-fix pass (TC-069): a free color
                            // (Aluminium/Orange) never carries this charge —
                            // the onChange handler above already forces it
                            // to 0 the moment one is picked, but the input
                            // stayed editable, letting staff type a
                            // non-zero value straight back in and silently
                            // contradict the "free" color they just chose.
                            // Disabling it while a free color is selected
                            // makes that impossible instead of just
                            // resetting it once.
                            disabled={FREE_PAINT_COLORS.has(row.color?.trim() ?? "")}
                            value={row.colorCharge ?? ""}
                            onChange={(e) =>
                              updateRow(index, {
                                colorCharge: e.target.value ? Number(e.target.value) : undefined,
                              })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Hanging Structure</Label>
                          <Select
                            value={row.hangingStructureType ?? ""}
                            onChange={(e) =>
                              updateRow(index, {
                                hangingStructureType: (e.target.value || undefined) as
                                  | HangingStructureType
                                  | undefined,
                              })
                            }
                          >
                            <option value="">Select...</option>
                            {HANGING_STRUCTURE_OPTIONS.map((h) => (
                              <option key={h.value} value={h.value}>
                                {h.label}
                              </option>
                            ))}
                          </Select>
                        </div>
                        {row.hangingStructureType === "PIPE_TRUSS" && (
                          <div className="space-y-1">
                            <Label className="text-xs">Pipe Length</Label>
                            <Input
                              value={row.pipeLength ?? ""}
                              onChange={(e) => updateRow(index, { pipeLength: e.target.value })}
                              placeholder="e.g. 3 ft"
                            />
                          </div>
                        )}
                        <div className="space-y-1">
                          <Label className="text-xs">Hanging Structure Charge (₹)</Label>
                          <Input
                            type="number"
                            min={0}
                            value={row.hangingStructureCharge ?? ""}
                            onChange={(e) =>
                              updateRow(index, {
                                hangingStructureCharge: e.target.value ? Number(e.target.value) : undefined,
                              })
                            }
                          />
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
