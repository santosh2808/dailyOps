import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { LIMITS, errorsUnder } from "./contentOptions";
import type { ContentProductOption } from "@/types";

export interface ProductUsedRow {
  formWebsiteProductId: string;
  quantity: string;
}

interface ProductsUsedFieldProps {
  options: ContentProductOption[];
  value: ProductUsedRow[];
  onChange: (value: ProductUsedRow[]) => void;
  errors: Record<string, string>;
  disabled?: boolean;
}

// Products used
export default function ProductsUsedField({ options, value, onChange, errors, disabled }: ProductsUsedFieldProps) {
  const chosen = new Set(value.map((row) => row.formWebsiteProductId));

  function setAt(index: number, patch: Partial<ProductUsedRow>) {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-2" data-error-key="products">
      <Label>Products used *</Label>
      {options.length === 0 && (
        <p className="text-sm text-muted-foreground">
          This website has no enabled product mappings yet. An administrator can add them under Web Form Configuration.
        </p>
      )}
      {value.map((row, index) => (
        <div key={index} className="space-y-1">
          <div className="flex gap-2">
            <div className="flex-1">
              <Select
                value={row.formWebsiteProductId}
                disabled={disabled}
                aria-label={`Product ${index + 1}`}
                onChange={(e) => setAt(index, { formWebsiteProductId: e.target.value })}
              >
                <option value="">Choose a product</option>
                {options
                  .filter((o) => o.id === row.formWebsiteProductId || !chosen.has(o.id))
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label} ({o.publicCode})
                    </option>
                  ))}
              </Select>
            </div>
            <Input
              className="w-24"
              type="number"
              min={1}
              step={1}
              placeholder="Qty"
              value={row.quantity}
              disabled={disabled}
              aria-label={`Product ${index + 1} quantity`}
              onChange={(e) => setAt(index, { quantity: e.target.value })}
            />
            {!disabled && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Remove product"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
          {errorsUnder(errors, `products.${index}`).map((message) => (
            <p key={message} className="text-xs text-destructive">
              {message}
            </p>
          ))}
        </div>
      ))}
      {!disabled && value.length < Math.min(LIMITS.products, options.length) && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...value, { formWebsiteProductId: "", quantity: "1" }])}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add product
        </Button>
      )}
      {errors.products && <p className="text-xs text-destructive">{errors.products}</p>}
    </div>
  );
}
