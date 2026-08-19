import { Badge } from "@/components/ui/badge";
import { statusBadgeVariant, statusLabel } from "./supplierOptions";
import type { SupplierStatus } from "@/types";

export default function SupplierStatusBadge({ status }: { status: SupplierStatus }) {
  return <Badge variant={statusBadgeVariant(status)}>{statusLabel(status)}</Badge>;
}
