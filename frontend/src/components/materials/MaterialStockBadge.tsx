import { Badge } from "@/components/ui/badge";
import { getMaterialStockLevel, type Material } from "@/types";

export default function MaterialStockBadge({ material }: { material: Material }) {
  const level = getMaterialStockLevel(material);
  if (level === "out_of_stock") {
    return <Badge variant="destructive">Out of Stock</Badge>;
  }
  if (level === "low_stock") {
    return <Badge variant="warning">Low Stock</Badge>;
  }
  return <Badge variant="success">In Stock</Badge>;
}
