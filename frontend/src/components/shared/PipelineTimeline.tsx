import { useId, useState } from "react";
import { ArrowRight, Check, ChevronDown, ChevronUp, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import type { JeoTimelineStep } from "@/types";

function formatDateTime(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString();
}

interface PipelineTimelineProps {
  steps: JeoTimelineStep[];
  loading?: boolean;
  // Optional: lets a caller make specific reached steps clickable (e.g. Lead
  // Details wiring "Quotation Sent" straight to that quotation) without this
  // shared component needing to know anything about quotations, JEOs, or any
  // other domain concept. Only step.key values listed in clickableKeys get
  // button/hover treatment — everything else stays plain, so the tracker
  // doesn't invite clicks on steps that have nowhere to go. Never applied to
  // a step that isn't `done` yet, since there's nothing to navigate to.
  clickableKeys?: string[];
  onStepClick?: (key: string) => void;
}

// Horizontal cross-module pipeline stepper — circles connected by a line
// across the top, label/timestamp stacked underneath each circle, so the
// whole lifecycle can be scanned left-to-right at a glance. Shared between
// Lead Details (LeadsService.getPipelineTimeline()) and, if reused later,
// any other page that surfaces the same JeoTimelineStep[] shape. JEO
// Details keeps its own separate vertical JeoTimeline component
// unchanged — this one is additive, not a replacement.
//
// Each step has a fixed width and the row scrolls horizontally (rather
// than wrapping) when there isn't room for every step, so it stays
// readable on narrower screens instead of collapsing into an uneven
// wrapped grid.
//
// Phones (below md) get MobileProgress instead: a status card (current
// stage, "Step X of N", next stage) over a segmented bar, with the full
// stage list one tap away — no sideways scrolling. Same steps, dates,
// done/not-reached states and clickable steps; the horizontal stepper is
// unchanged at md and up.
export default function PipelineTimeline({ steps, loading, clickableKeys, onStepClick }: PipelineTimelineProps) {
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

  return (
    <>
      <MobileProgress steps={steps} clickableKeys={clickableKeys} onStepClick={onStepClick} />
      <div className="overflow-x-auto pb-1 max-md:hidden">
        <ol className="flex items-start">
          {steps.map((step, index) => {
            const isFirst = index === 0;
            const isLast = index === steps.length - 1;
            const prevDone = index > 0 && steps[index - 1].done;
            const at = formatDateTime(step.at);
            const clickable = step.done && !!onStepClick && !!clickableKeys?.includes(step.key);
            const labelBlock = (
              <div className="mt-2 px-1 text-center">
                <p
                  className={cn(
                    "text-xs font-medium leading-tight",
                    step.done ? "text-slate-900" : "text-muted-foreground",
                    clickable && "underline decoration-dotted underline-offset-2 group-hover:text-orange"
                  )}
                >
                  {step.label}
                </p>
                <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                  {step.done ? at ?? "Completed" : "Not reached yet"}
                </p>
              </div>
            );
            return (
              <li key={step.key} className="flex w-28 flex-shrink-0 flex-col items-center">
                {/* Bug fix: the circle used to sit flush against the left edge
                    of this fixed-width column (with the connecting line
                    filling the rest to the right), while the label below was
                    centered in the full column — so circle and label drifted
                    further out of alignment the further along the tracker you
                    looked. A symmetric left/right connector (each a flex-1
                    span, present but transparent at the very first/last step
                    so the circle still sits dead-center) keeps the circle
                    centered in its column, matching the centered label below
                    it. The two halves of the segment BETWEEN two circles are
                    colored by the same thing (the earlier step's `done`
                    state) so a connecting line still reads as one continuous
                    color across the boundary between columns. */}
                <div className="flex w-full items-center">
                  <span
                    className={cn("h-px flex-1", !isFirst && (prevDone ? "bg-orange/40" : "bg-slate-200"))}
                  />
                  <span
                    className={cn(
                      "z-10 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full",
                      step.done ? "bg-orange text-white" : "bg-slate-200 text-slate-400"
                    )}
                  >
                    {step.done ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-2 w-2 fill-current" />}
                  </span>
                  <span
                    className={cn("h-px flex-1", !isLast && (step.done ? "bg-orange/40" : "bg-slate-200"))}
                  />
                </div>
                {clickable ? (
                  <button
                    type="button"
                    onClick={() => onStepClick(step.key)}
                    className="group flex flex-col items-center"
                    title={`View ${step.label}`}
                  >
                    {labelBlock}
                  </button>
                ) : (
                  labelBlock
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </>
  );
}

function formatShort(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function MobileProgress({ steps, clickableKeys, onStepClick }: PipelineTimelineProps) {
  const [showAll, setShowAll] = useState(false);
  const listId = useId();
  // Current stage = the furthest one reached.
  const currentIndex = Math.max(0, steps.reduce((last, step, i) => (step.done ? i : last), -1));
  const current = steps[currentIndex];
  const next = steps.slice(currentIndex + 1).find((step) => !step.done);
  // A lost lead's final stage reads as an outcome, not progress.
  const isLost = (step: JeoTimelineStep) => step.key === "lost" && step.done;
  const isClickable = (step: JeoTimelineStep) => step.done && !!onStepClick && !!clickableKeys?.includes(step.key);
  const currentAt = formatShort(current.at);

  return (
    <div className="space-y-3 md:hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("text-lg font-semibold leading-tight", isLost(current) ? "text-destructive" : "text-slate-900")}>
            {current.label}
          </p>
          {currentAt && <p className="mt-0.5 text-xs text-muted-foreground">since {currentAt}</p>}
        </div>
        <span className="flex-shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
          Step {currentIndex + 1} of {steps.length}
        </span>
      </div>

      <div className="flex gap-1" role="img" aria-label={`${steps.filter((s) => s.done).length} of ${steps.length} stages reached`}>
        {steps.map((step) => (
          <span
            key={step.key}
            className={cn(
              "h-2 flex-1 rounded-full",
              isLost(step) ? "bg-destructive" : step.done ? "bg-orange" : "bg-slate-200"
            )}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        {next ? (
          <p className="flex min-w-0 items-center gap-1.5 text-sm text-slate-600">
            <span className="text-muted-foreground">Next</span>
            <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
            <span className="truncate font-medium text-slate-900">{next.label}</span>
          </p>
        ) : (
          <span />
        )}
        <button
          type="button"
          className="flex flex-shrink-0 items-center gap-1 text-sm font-medium text-primary"
          aria-expanded={showAll}
          aria-controls={listId}
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? "Hide stages" : "View all stages"}
          {showAll ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {showAll && (
        <ol id={listId} className="relative space-y-1 border-t pt-3">
          {steps.map((step, index) => {
            const clickable = isClickable(step);
            const at = formatShort(step.at);
            const body = (
              <>
                <span
                  className={cn(
                    "z-10 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full",
                    isLost(step)
                      ? "bg-destructive text-white"
                      : step.done
                        ? "bg-orange text-white"
                        : "border-2 border-slate-200 bg-white text-slate-300"
                  )}
                >
                  {step.done ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-1.5 w-1.5 fill-current" />}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 text-sm",
                    step.done ? "font-medium text-slate-900" : "text-muted-foreground",
                    clickable && "underline decoration-dotted underline-offset-2"
                  )}
                >
                  {step.label}
                  {index === currentIndex && (
                    <span className="ml-2 rounded-full bg-orange/15 px-2 py-0.5 text-[11px] font-medium text-orange no-underline">
                      Current
                    </span>
                  )}
                </span>
                <span className="flex-shrink-0 text-right text-xs text-muted-foreground">
                  {step.done ? at ?? "Completed" : "Not reached yet"}
                </span>
              </>
            );
            const rowClass = cn(
              "relative flex w-full items-center gap-3 rounded-md px-2 py-2 text-left",
              index === currentIndex && "bg-orange/5"
            );
            return (
              <li key={step.key} className="relative">
                {/* Rail between this stage and the next. */}
                {index < steps.length - 1 && (
                  <span aria-hidden="true" className="absolute left-[19px] top-8 h-[calc(100%-12px)] w-px bg-slate-200" />
                )}
                {clickable ? (
                  <button type="button" onClick={() => onStepClick?.(step.key)} className={rowClass} title={`View ${step.label}`}>
                    {body}
                  </button>
                ) : (
                  <div className={rowClass}>{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
