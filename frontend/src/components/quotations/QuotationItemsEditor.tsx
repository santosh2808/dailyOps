import { Fragment, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
  // Color/hanging-structure charges are a flat extra amount for this line
  // (not multiplied by quantity) — mirrors QuotationsService.computeTotals().
  return item.quantity * (item.unitPrice ?? 0) + (item.colorCharge ?? 0) + (item.hangingStructureCharge ?? 0);
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
}: QuotationItemsEditorProps) {
  const [pendingProductId, setPendingProductId] = useState("");

  const productMap = useMemo(() => new Map(catalog.map((p) => [p.id, p])), [catalog]);

  function addProduct() {
    if (!pendingProductId) return;
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
    onChange(value.filter((_, i) => i !== index));
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
              <TableHead>Product</TableHead>
              <TableHead>Description</TableHead>
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
              return (
                <Fragment key={`${row.productId}-${index}`}>
                  <TableRow>
                    <TableCell className="font-medium text-slate-900">
                      {product?.name ?? "Unknown product"}
                    </TableCell>
                    <TableCell>
                      <Input
                        value={row.description ?? ""}
                        onChange={(e) => updateRow(index, { description: e.target.value })}
                        placeholder="Optional"
                      />
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
                            value={colorSelectValue(row.color)}
                            onChange={(e) => {
                              const selected = e.target.value;
                              updateRow(index, {
                                // Picking a fixed color stores it directly;
                                // picking Custom clears the field so the
                                // free-text box below starts blank instead
                                // of showing a stale fixed-color value.
                                color: selected === "CUSTOM" ? "" : selected || undefined,
                                // A non-standard color always carries the
                                // "specific paint" extra charge (see the
                                // Quotation PDF's own Exclusions line) — pre-
                                // fill that amount the moment Custom is
                                // picked, still editable. Switching back to a
                                // standard color clears it again.
                                colorCharge:
                                  selected === "CUSTOM"
                                    ? row.colorCharge || STANDARD_PAINT_EXTRA_CHARGE
                                    : selected
                                      ? 0
                                      : row.colorCharge,
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
                          {colorSelectValue(row.color) === "CUSTOM" && (
                            <>
                              <Input
                                value={row.color ?? ""}
                                onChange={(e) => updateRow(index, { color: e.target.value })}
                                placeholder="e.g. Custom RAL 9016 White"
                                className="mt-1"
                              />
                              <p className="text-xs text-muted-foreground">
                                Not one of the standard colors — carries an extra charge (see Color Charge).
                              </p>
                            </>
                          )}
                          {isFanProduct(product) && !row.color?.trim() && (
                            <p className="text-xs text-destructive">Required — ask the customer which color they want.</p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Color Charge (₹)</Label>
                          <Input
                            type="number"
                            min={0}
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
