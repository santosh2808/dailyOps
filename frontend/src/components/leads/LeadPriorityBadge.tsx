import { Badge } from "@/components/ui/badge";
import { priorityBadgeVariant, priorityLabel } from "./leadOptions";
import type { LeadPriority } from "@/types";

export default function LeadPriorityBadge({ priority }: { priority: LeadPriority }) {
  return <Badge variant={priorityBadgeVariant(priority)}>{priorityLabel(priority)}</Badge>;
}
