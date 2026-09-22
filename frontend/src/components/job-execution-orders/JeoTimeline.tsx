import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
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
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner /> Loading timeline...
      </p>
    );
  }

  if (!steps.length) {
    return <p className="text-sm text-muted-foreground">No timeline data available.</p>;
  }

  // Bug fix / UX request: was a vertical list, hard to scan at a glance.
  // Rebuilt as a horizontal stepper — circles connected by a line across the
  // top, labels/timestamps stacked underneath each circle. Each step has a
  // fixed width and the row scrolls horizontally (rather than wrapping)
  // when there isn't enough space for all steps, so the stepper never
  // collapses into an unreadable wrapped grid on narrower screens.
  return (
    <div className="overflow-x-auto pb-1">
      <ol className="flex items-start">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          const at = formatDateTime(step.at);
          return (
            <li key={step.key} className="flex w-28 flex-shrink-0 flex-col items-center">
              <div className="flex w-full items-center">
                <span
                  className={cn(
                    "z-10 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full",
                    step.done ? "bg-orange text-white" : "bg-slate-200 text-slate-400"
                  )}
                >
                  {step.done ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-2 w-2 fill-current" />}
                </span>
                {!isLast && (
                  <span
                    className={cn("h-px flex-1", step.done ? "bg-orange/40" : "bg-slate-200")}
                  />
                )}
              </div>
              <div className="mt-2 px-1 text-center">
                <p className={cn("text-xs font-medium leading-tight", step.done ? "text-slate-900" : "text-muted-foreground")}>
                  {step.label}
                </p>
                <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                  {step.done ? at ?? "Completed" : "Not reached yet"}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
