import { Badge } from "@/components/ui/badge";
import { statusBadgeVariant, statusLabel } from "./proformaInvoiceOptions";
import type { ProformaInvoiceStatus } from "@/types";

export default function ProformaInvoiceStatusBadge({ status }: { status: ProformaInvoiceStatus }) {
  return <Badge variant={statusBadgeVariant(status)}>{statusLabel(status)}</Badge>;
}
