import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { JeoTimelineStep } from "@/types";

function formatDateTime(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString();
}

interface JeoTimelineProps {
  steps: JeoTimelineStep[];
  loading?: boolean;
}

// Renders the cross-module lifecycle trail (Lead → Customer → Quotation →
// Sales Order → Proforma Invoice → JEO → production steps → Completed) built
// server-side by JobExecutionOrdersService.getTimeline(). Steps without a
// timestamp are either not yet reached, or reached at some point in the past
// that this schema doesn't store precisely — see that service's doc comment
// for exactly which steps fall into each case.
export default function JeoTimeline({ steps, loading }: JeoTimelineProps) {
  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading timeline...</p>;
  }

  if (!steps.length) {
    return <p className="text-sm text-muted-foreground">No timeline data available.</p>;
  }

  return (
    <ol className="space-y-0">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const at = formatDateTime(step.at);
        return (
          <li key={step.key} className="relative flex gap-3 pb-6 last:pb-0">
            {!isLast && (
              <span
                className={cn(
                  "absolute left-[11px] top-6 h-full w-px",
                  step.done ? "bg-orange/40" : "bg-slate-200"
                )}
              />
            )}
            <span
              className={cn(
                "z-10 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full",
                step.done ? "bg-orange text-white" : "bg-slate-200 text-slate-400"
              )}
            >
              {step.done ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-2 w-2 fill-current" />}
            </span>
            <div className="pt-0.5">
              <p className={cn("text-sm font-medium", step.done ? "text-slate-900" : "text-muted-foreground")}>
                {step.label}
              </p>
              <p className="text-xs text-muted-foreground">
                {step.done ? at ?? "Completed" : "Not reached yet"}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
