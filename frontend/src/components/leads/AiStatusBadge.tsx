import { Badge } from "@/components/ui/badge";
import { aiStatusBadgeVariant, aiStatusLabel } from "./aiOptions";
import type { AiLeadStatus } from "@/types";

export default function AiStatusBadge({ status }: { status: AiLeadStatus }) {
  return <Badge variant={aiStatusBadgeVariant(status)}>{aiStatusLabel(status)}</Badge>;
}
