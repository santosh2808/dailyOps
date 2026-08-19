import { Badge } from "@/components/ui/badge";
import { priorityBadgeVariant, priorityLabel } from "./jeoOptions";
import type { JeoPriority } from "@/types";

export default function JeoPriorityBadge({ priority }: { priority: JeoPriority }) {
  return <Badge variant={priorityBadgeVariant(priority)}>{priorityLabel(priority)}</Badge>;
}
