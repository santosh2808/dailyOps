import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProductionChecklist } from "@/types";

interface ChecklistFieldConfig {
  key: keyof Omit<ProductionChecklist, "id" | "jeoId" | "completedAt">;
  label: string;
}

const CHECKLIST_FIELDS: ChecklistFieldConfig[] = [
  { key: "materialIssued", label: "Material Issued" },
  { key: "assemblyStarted", label: "Assembly Started" },
  { key: "controllerInstalled", label: "Controller Installed" },
  { key: "wiringCompleted", label: "Wiring Completed" },
  { key: "qcPassed", label: "QC Passed" },
  { key: "packed", label: "Packed" },
  { key: "readyForDispatch", label: "Ready For Dispatch" },
];

interface ProductionChecklistCardProps {
  checklist?: ProductionChecklist;
  disabled?: boolean;
  onToggle: (key: ChecklistFieldConfig["key"], value: boolean) => void;
}

function formatDate(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString();
}

// Each box is toggled independently and PATCHes just that field (see
// api/job-execution-orders.ts updateProductionChecklist) — this card gives
// a supervisor granular, checkbox-by-checkbox control over the production
// steps, separate from the coarser Start Production / Mark QC Complete /
// Ready For Dispatch quick-action buttons on the Details page, which flip
// the relevant box(es) together with the JEO's overall status.
export default function ProductionChecklistCard({
  checklist,
  disabled,
  onToggle,
}: ProductionChecklistCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Production Checklist</CardTitle>
      </CardHeader>
      <CardContent>
        {!checklist ? (
          <p className="text-sm text-muted-foreground">No checklist found for this JEO.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CHECKLIST_FIELDS.map(({ key, label }) => (
              <label
                key={key}
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-slate-900"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-orange focus:ring-orange"
                  checked={checklist[key]}
                  disabled={disabled}
                  onChange={(e) => onToggle(key, e.target.checked)}
                />
                {label}
              </label>
            ))}
          </div>
        )}

        {checklist?.completedAt && (
          <p className="mt-4 text-xs text-muted-foreground">
            Completed at {formatDate(checklist.completedAt)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
