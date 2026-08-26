import { Badge } from "@/components/ui/badge";
import { statusBadgeVariant, statusLabel } from "./complaintOptions";
import type { ComplaintStatus } from "@/types";

export default function ComplaintStatusBadge({ status }: { status: ComplaintStatus }) {
  return <Badge variant={statusBadgeVariant(status)}>{statusLabel(status)}</Badge>;
}
