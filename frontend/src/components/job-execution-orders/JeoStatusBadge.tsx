import { Badge } from "@/components/ui/badge";
import { statusBadgeVariant, statusLabel } from "./jeoOptions";
import type { JeoStatus } from "@/types";

export default function JeoStatusBadge({ status }: { status: JeoStatus }) {
  return <Badge variant={statusBadgeVariant(status)}>{statusLabel(status)}</Badge>;
}
