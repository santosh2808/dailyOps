import { Badge } from "@/components/ui/badge";
import { statusBadgeVariant, statusLabel } from "./contentOptions";
import type { ContentPostStatus } from "@/types";

interface ContentStatusBadgeProps {
  status: ContentPostStatus;
  // Pending live edits
  hasUnpublishedChanges?: boolean;
}

export default function ContentStatusBadge({ status, hasUnpublishedChanges }: ContentStatusBadgeProps) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge variant={statusBadgeVariant(status)}>{statusLabel(status)}</Badge>
      {status === "PUBLISHED" && hasUnpublishedChanges && <Badge variant="warning">Unpublished changes</Badge>}
    </span>
  );
}
