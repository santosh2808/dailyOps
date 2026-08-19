import { Badge } from "@/components/ui/badge";
import { statusBadgeVariant, statusLabel } from "./leadOptions";
import type { LeadStatus } from "@/types";

export default function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return <Badge variant={statusBadgeVariant(status)}>{statusLabel(status)}</Badge>;
}
