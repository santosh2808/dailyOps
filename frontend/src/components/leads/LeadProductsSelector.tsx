import { Fragment, useEffect, useMemo, useState } from "react";
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
import { listProducts } from "@/api/products";
import { getErrorMessage } from "@/lib/errors";
import type { LeadProductPayload } from "@/api/leads";
import type { Product } from "@/types";
import { isFanProduct } from "@/components/quotations/QuotationItemsEditor";
import {
  FREE_PAINT_COLORS,
  PAINT_COLOR_OPTIONS,
  STANDARD_PAINT_EXTRA_CHARGE,
  colorSelectValue,
} from "@/components/quotations/quotationOptions";

interface LeadProductsSelectorProps {
  value: LeadProductPayload[];
  onChange: (value: LeadProductPayload[]) => void;
}

// Reused by both the Create and Edit Lead forms so the "Products (Multi
// Select)" behaviour only needs to be implemented once.
export default function LeadProductsSelector({ value, onChange }: LeadProductsSelectorProps) {
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [pendingProductId, setPendingProductId] = useState("");
  const [loadError, setLoadError] = useState("");
  // Bug fix: mirrors QuotationItemsEditor.tsx's customColorProductIds
  // pattern exactly — keeps the free-text "Custom" box visible even while
  // it's empty, instead of colorSelectValue("") snapping the dropdown back
  // to "no selection".
  const [customColorProductIds, setCustomColorProductIds] = useState<Set<string>>(new Set());

  function setCustomColorMode(productId: string, isCustom: boolean) {
    setCustomColorProductIds((prev) => {
      const next = new Set(prev);
      if (isCustom) next.add(productId);
      else next.delete(productId);
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;
    async function loadCatalog() {
      try {
        const res = await listProducts({ page: 1, limit: 100 });
        if (!cancelled) setCatalog(res.data);
      } catch (err) {
        if (!cancelled) setLoadError(getErrorMessage(err, "Could not load the product catalog."));
      }
    }
    loadCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  const productMap = useMemo(() => new Map(catalog.map((p) => [p.id, p])), [catalog]);
  const availableProducts = useMemo(
    () => catalog.filter((p) => !value.some((v) => v.productId === p.id)),
    [catalog, value]
  );

  function addProduct() {
    if (!pendingProductId) return;
    const product = productMap.get(pendingProductId);
    onChange([
      ...value,
      {
        productId: pendingProductId,
        quantity: 1,
        unitPrice: product?.price ?? undefined,
      },
    ]);
    setPendingProductId("");
  }

  function updateRow(productId: string, patch: Partial<LeadProductPayload>) {
    onChange(value.map((row) => (row.productId === productId ? { ...row, ...patch } : row)));
  }

  function removeRow(productId: string) {
    onChange(value.filter((row) => row.productId !== productId));
    setCustomColorMode(productId, false);
  }

  return (
    <div className="space-y-3">
      <Label>Products</Label>

      <div className="flex gap-2">
        <Select
          value={pendingProductId}
          onChange={(e) => setPendingProductId(e.target.value)}
          className="max-w-sm"
        >
          <option value="">Select a product to add...</option>
          {availableProducts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.category})
            </option>
          ))}
        </Select>
        <Button type="button" variant="outline" onClick={addProduct} disabled={!pendingProductId}>
          <Plus className="mr-1 h-4 w-4" />
          Add
        </Button>
      </div>

      {loadError && <p className="text-xs text-destructive">{loadError}</p>}

      {value.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="w-24">Qty</TableHead>
              <TableHead className="w-32">Unit Price</TableHead>
              <TableHead>Remarks</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {value.map((row) => {
              const product = productMap.get(row.productId);
              const isFan = isFanProduct(product);
              return (
                <Fragment key={row.productId}>
                  <TableRow>
                    <TableCell className="font-medium text-slate-900">
                      {product?.name ?? "Unknown product"}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        value={row.quantity}
                        onChange={(e) =>
                          updateRow(row.productId, { quantity: Number(e.target.value) || 1 })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        value={row.unitPrice ?? ""}
                        onChange={(e) =>
                          updateRow(row.productId, {
                            unitPrice: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={row.remarks ?? ""}
                        onChange={(e) => updateRow(row.productId, { remarks: e.target.value })}
                        placeholder="Optional"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRow(row.productId)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {/*
                    Bug fix: this Color picker used to not exist anywhere in
                    the Lead -> "Generate Quotation" flow at all. That
                    one-click action (see QuotationsService.create()'s
                    leadId branch) derives its Quotation items straight from
                    this row, and QuotationsService.computeTotals() always
                    rejects a fan-type item with no confirmed paint Color —
                    so any lead with a fan product could never generate a
                    quotation, with no way to fix it from this screen.
                    Reuses the exact same options/logic as
                    QuotationItemsEditor.tsx's per-item Color field so this
                    matches what staff already know from the Quotation
                    screen.
                  */}
                  <TableRow>
                    <TableCell colSpan={5} className="bg-slate-50 py-3">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Color {isFan ? "" : "(optional, priced separately)"}
                      </p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Color{isFan ? " *" : ""}</Label>
                          <Select
                            value={
                              customColorProductIds.has(row.productId)
                                ? "CUSTOM"
                                : colorSelectValue(row.color)
                            }
                            onChange={(e) => {
                              const selected = e.target.value;
                              const isFree = FREE_PAINT_COLORS.has(selected);
                              setCustomColorMode(row.productId, selected === "CUSTOM");
                              updateRow(row.productId, {
                                color: selected === "CUSTOM" ? "" : selected || undefined,
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
                                setCustomColorMode(row.productId, true);
                                updateRow(row.productId, { color: e.target.value });
                              }}
                              placeholder="e.g. Custom RAL 9016 White"
                              className="mt-1"
                            />
                          )}
                          {isFan && !row.color?.trim() && (
                            <p className="text-xs text-muted-foreground">
                              Required before this lead can be used to generate a quotation —
                              ask the customer which color they want.
                            </p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Color Charge (₹)</Label>
                          <Input
                            type="number"
                            min={0}
                            disabled={FREE_PAINT_COLORS.has(row.color?.trim() ?? "")}
                            value={row.colorCharge ?? ""}
                            onChange={(e) =>
                              updateRow(row.productId, {
                                colorCharge: e.target.value ? Number(e.target.value) : undefined,
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
