import { Badge } from "@/components/ui/badge";
import { statusBadgeVariant, statusLabel } from "./salesOrderOptions";
import type { SalesOrderStatus } from "@/types";

export default function SalesOrderStatusBadge({ status }: { status: SalesOrderStatus }) {
  return <Badge variant={statusBadgeVariant(status)}>{statusLabel(status)}</Badge>;
}
