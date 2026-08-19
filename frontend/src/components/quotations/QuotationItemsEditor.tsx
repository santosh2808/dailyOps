import { useEffect, useMemo, useState } from "react";
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
import type { QuotationItemPayload } from "@/api/quotations";
import type { Product } from "@/types";

interface QuotationItemsEditorProps {
  value: QuotationItemPayload[];
  onChange: (value: QuotationItemPayload[]) => void;
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
  return item.quantity * (item.unitPrice ?? 0);
}

export function computeSubtotal(items: QuotationItemPayload[]) {
  return items.reduce((sum, item) => sum + lineTotal(item), 0);
}

// Multiple quotation items, each tied to a Product, with quantity and unit
// price (auto-filled from the catalog, editable). Mirrors the structure of
// LeadProductsSelector so the two multi-line editors stay visually
// consistent across the app.
export default function QuotationItemsEditor({ value, onChange }: QuotationItemsEditorProps) {
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [pendingProductId, setPendingProductId] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadCatalog() {
      try {
        const res = await listProducts({ page: 1, limit: 100 });
        if (!cancelled) setCatalog(res.data);
      } catch {
        if (!cancelled) setLoadError("Could not load the product catalog.");
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
              <TableHead>Product</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-24">Qty</TableHead>
              <TableHead className="w-32">Unit Price</TableHead>
              <TableHead className="w-32">Line Total</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {value.map((row, index) => (
              <TableRow key={`${row.productId}-${index}`}>
                <TableCell className="font-medium text-slate-900">
                  {productMap.get(row.productId)?.name ?? "Unknown product"}
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
                  />
                </TableCell>
                <TableCell className="text-slate-700">{formatCurrency(lineTotal(row))}</TableCell>
                <TableCell>
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(index)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
