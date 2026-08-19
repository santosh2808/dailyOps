import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SalesOrderItemPayload } from "@/api/sales-orders";

// A Sales Order's products auto-populate from its originating Quotation
// (business rule) — unlike QuotationItemsEditor/LeadProductsSelector, rows
// here can't be freely added or removed; only quantity (and, if needed, a
// per-line discount) can be edited before saving. Product name and unit
// price are shown read-only because they were inherited from the quotation.
export interface SalesOrderItemRow extends SalesOrderItemPayload {
  productName: string;
}

interface SalesOrderItemsEditorProps {
  value: SalesOrderItemRow[];
  onChange: (value: SalesOrderItemRow[]) => void;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

export function lineTotal(item: SalesOrderItemPayload) {
  return item.quantity * (item.unitPrice ?? 0) - (item.discount ?? 0);
}

export function computeSubtotal(items: SalesOrderItemPayload[]) {
  return items.reduce((sum, item) => sum + item.quantity * (item.unitPrice ?? 0), 0);
}

export function computeItemDiscountTotal(items: SalesOrderItemPayload[]) {
  return items.reduce((sum, item) => sum + (item.discount ?? 0), 0);
}

export default function SalesOrderItemsEditor({ value, onChange }: SalesOrderItemsEditorProps) {
  function updateRow(index: number, patch: Partial<SalesOrderItemRow>) {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-3">
      <Label>Order Items (auto-populated from the quotation)</Label>

      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No items — select an Accepted Quotation to auto-populate products.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-28">Qty</TableHead>
              <TableHead className="w-32">Unit Price</TableHead>
              <TableHead className="w-28">Discount</TableHead>
              <TableHead className="w-32">Line Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {value.map((row, index) => (
              <TableRow key={`${row.productId}-${index}`}>
                <TableCell className="font-medium text-slate-900">{row.productName}</TableCell>
                <TableCell className="text-muted-foreground">{row.description || "—"}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={1}
                    value={row.quantity}
                    onChange={(e) => updateRow(index, { quantity: Number(e.target.value) || 1 })}
                  />
                </TableCell>
                <TableCell className="text-slate-700">{formatCurrency(row.unitPrice ?? 0)}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    value={row.discount ?? 0}
                    onChange={(e) =>
                      updateRow(index, { discount: e.target.value ? Number(e.target.value) : 0 })
                    }
                  />
                </TableCell>
                <TableCell className="text-slate-700">{formatCurrency(lineTotal(row))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
