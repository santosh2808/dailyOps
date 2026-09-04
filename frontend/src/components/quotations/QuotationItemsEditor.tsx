import { Fragment, useEffect, useMemo, useState } from "react";
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
import { toast } from "@/lib/toast";
import { listProducts } from "@/api/products";
import { HANGING_STRUCTURE_OPTIONS } from "@/components/job-execution-orders/jeoOptions";
import type { QuotationItemPayload } from "@/api/quotations";
import type { HangingStructureType, Product } from "@/types";

interface QuotationItemsEditorProps {
  value: QuotationItemPayload[];
  onChange: (value: QuotationItemPayload[]) => void;
  // Additive: fired when staff raise a row's unit price above the product's
  // own catalog price — QuotationForm.tsx uses this to prompt whether the
  // higher price already includes installation/transportation/GST (see
  // ConfirmPriceIncludesChargesDialog). Fires on blur, not on every
  // keystroke, so it doesn't nag mid-edit.
  onUnitPriceAboveBase?: (productName: string) => void;
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
export default function QuotationItemsEditor({ value, onChange, onUnitPriceAboveBase }: QuotationItemsEditorProps) {
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [pendingProductId, setPendingProductId] = useState("");
  const [loadError, setLoadError] = useState("");
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadCatalog() {
      try {
        const res = await listProducts({ page: 1, limit: 100 });
        if (!cancelled) setCatalog(res.data);
      } catch {
        if (!cancelled) {
          setLoadError("Could not load the product catalog.");
          toast.error("Could not load the product catalog.");
        }
      }
    }
    loadCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

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

      {loadError && <p className="text-xs text-destructive">{loadError}</p>}

      {value.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
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
              const expanded = expandedIndex === index;
              const hasExtras =
                !!row.color?.trim() ||
                (row.colorCharge ?? 0) > 0 ||
                !!row.hangingStructureType ||
                (row.hangingStructureCharge ?? 0) > 0;
              return (
                <Fragment key={`${row.productId}-${index}`}>
                  <TableRow>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="Color / Hanging Structure"
                        onClick={() => setExpandedIndex(expanded ? null : index)}
                      >
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium text-slate-900">
                      {product?.name ?? "Unknown product"}
                      {hasExtras && !expanded && (
                        <span className="ml-1 text-xs font-normal text-slate-500">(color/structure set)</span>
                      )}
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
                  {expanded && (
                    <TableRow>
                      <TableCell />
                      <TableCell colSpan={6} className="bg-slate-50">
                        <div className="grid grid-cols-1 gap-3 py-2 sm:grid-cols-5">
                          <div className="space-y-1">
                            <Label className="text-xs">Color</Label>
                            <Input
                              value={row.color ?? ""}
                              onChange={(e) => updateRow(index, { color: e.target.value })}
                              placeholder="e.g. Custom RAL 9016"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Color Charge</Label>
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
                            <Label className="text-xs">Hanging Structure Charge</Label>
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
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
