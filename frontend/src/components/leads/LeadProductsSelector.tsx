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
import type { LeadProductPayload } from "@/api/leads";
import type { Product } from "@/types";

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
            {value.map((row) => (
              <TableRow key={row.productId}>
                <TableCell className="font-medium text-slate-900">
                  {productMap.get(row.productId)?.name ?? "Unknown product"}
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
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
