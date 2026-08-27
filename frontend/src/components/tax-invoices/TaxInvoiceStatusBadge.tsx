import { Badge } from "@/components/ui/badge";
import { statusBadgeVariant, statusLabel } from "./taxInvoiceOptions";
import type { TaxInvoiceStatus } from "@/types";

export default function TaxInvoiceStatusBadge({ status }: { status: TaxInvoiceStatus }) {
  return <Badge variant={statusBadgeVariant(status)}>{statusLabel(status)}</Badge>;
}
