import { Badge } from "@/components/ui/badge";
import { statusBadgeVariant, statusLabel } from "./quotationOptions";
import type { QuotationStatus } from "@/types";

export default function QuotationStatusBadge({ status }: { status: QuotationStatus }) {
  return <Badge variant={statusBadgeVariant(status)}>{statusLabel(status)}</Badge>;
}
