import { Badge } from "@/components/ui/badge";
import { aiQualificationBadgeVariant, aiQualificationLabel } from "./aiOptions";
import type { AiQualification } from "@/types";

export default function AiQualificationBadge({ qualification }: { qualification: AiQualification }) {
  return <Badge variant={aiQualificationBadgeVariant(qualification)}>{aiQualificationLabel(qualification)}</Badge>;
}
