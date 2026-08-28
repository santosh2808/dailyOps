import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Product } from "@/types";

interface ProductViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm text-slate-900">{value || "—"}</p>
    </div>
  );
}

function formatPrice(price?: number | null) {
  if (price == null) return null;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(price);
}

export default function ProductViewDialog({
  open,
  onOpenChange,
  product,
}: ProductViewDialogProps) {
  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Product Details</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Product Name" value={product.name} />
          <Field label="Category" value={<Badge variant="orange">{product.category}</Badge>} />
          <Field label="SKU / Model Code" value={product.sku} />
          <Field label="Applicable To" value={product.applicableTo} />
          <Field label="Price" value={formatPrice(product.price)} />
          <Field
            label="Status"
            value={
              <Badge variant={product.isActive ? "success" : "muted"}>
                {product.isActive ? "Active" : "Inactive"}
              </Badge>
            }
          />
          <Field label="Standard Price" value={formatPrice(product.standardPrice)} />
          <Field label="Minimum Price" value={formatPrice(product.minPrice)} />
          <Field
            label="Max Discount %"
            value={product.maxDiscountPercent != null ? `${product.maxDiscountPercent}%` : null}
          />
          <Field label="Last Updated" value={new Date(product.updatedAt).toLocaleDateString()} />
          <Field label="Model No. (Quotation PDF)" value={product.technicalSpec?.modelNo} />
          <Field label="Fan Size (Quotation PDF)" value={product.technicalSpec?.fanSize} />
        </div>

        {product.description && (
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Description
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-900">
              {product.description}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
