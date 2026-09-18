import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Calendar-popup date-range picker, replacing the two plain
// <input type="date"> boxes the Leads filter bar used to use. Hand-rolled
// like every other primitive in this project (no @radix-ui / no date-picker
// library — see dropdown-menu.tsx for the same click-outside/Escape-to-close
// pattern this reuses). Values are passed and returned as the same
// yyyy-mm-dd strings <input type="date"> always used, so callers (e.g.
// LeadFilters.dateFrom/dateTo) don't need to change shape.
interface DateRangePickerProps {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  placeholder?: string;
  className?: string;
}

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function parseISODate(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatShort(value: string): string {
  const date = parseISODate(value);
  if (!date) return "";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function buildMonthGrid(viewDate: Date): (Date | null)[][] {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const startOffset = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export default function DateRangePicker({
  from,
  to,
  onChange,
  placeholder = "Created date range",
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState<Date | null>(null);
  const [draftTo, setDraftTo] = useState<Date | null>(null);
  // While the start date is picked but the end date isn't yet, this tracks
  // whichever day the mouse is currently over so the days in between can be
  // highlighted as a live preview of the range the next click would commit.
  const [hoverDay, setHoverDay] = useState<Date | null>(null);
  const [viewDate, setViewDate] = useState<Date>(() => parseISODate(from) ?? new Date());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function openPicker() {
    // Re-seed the draft from the already-applied range every time the
    // popover opens, so closing it without hitting Apply (outside click /
    // Escape) never leaks a half-made selection into next time.
    const seededFrom = parseISODate(from);
    const seededTo = parseISODate(to);
    setDraftFrom(seededFrom);
    setDraftTo(seededTo);
    setHoverDay(null);
    setViewDate(seededFrom ?? new Date());
    setOpen(true);
  }

  function handleDayClick(day: Date) {
    if (!draftFrom || draftTo) {
      setDraftFrom(day);
      setDraftTo(null);
      setHoverDay(null);
      return;
    }
    if (day < draftFrom) {
      setDraftTo(draftFrom);
      setDraftFrom(day);
    } else {
      setDraftTo(day);
    }
    setHoverDay(null);
  }

  function handleApply() {
    onChange({
      from: draftFrom ? toISODate(draftFrom) : "",
      to: draftTo ? toISODate(draftTo) : draftFrom ? toISODate(draftFrom) : "",
    });
    setOpen(false);
  }

  function handleClearDraft() {
    setDraftFrom(null);
    setDraftTo(null);
  }

  const weeks = useMemo(() => buildMonthGrid(viewDate), [viewDate]);
  const today = new Date();

  const label = from && to ? `${formatShort(from)} – ${formatShort(to)}` : from ? `${formatShort(from)} – ...` : placeholder;

  return (
    <div ref={rootRef} className={cn("relative inline-block", className)}>
      <Button
        type="button"
        variant="outline"
        className={cn("w-56 justify-start font-normal", !from && !to && "text-muted-foreground")}
        onClick={() => (open ? setOpen(false) : openPicker())}
      >
        <CalendarDays className="mr-2 h-4 w-4 flex-shrink-0" />
        <span className="truncate">{label}</span>
      </Button>

      {open && (
        <div className="absolute z-50 mt-1 w-72 rounded-md border border-input bg-background p-3 shadow-md animate-in fade-in-0 zoom-in-95">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              className="rounded p-1 hover:bg-accent"
              onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-sm font-medium">
              {MONTH_LABELS[viewDate.getMonth()]} {viewDate.getFullYear()}
            </p>
            <button
              type="button"
              className="rounded p-1 hover:bg-accent"
              onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 text-center text-xs text-muted-foreground">
            {WEEKDAY_LABELS.map((w, i) => (
              <span key={i} className="py-1">
                {w}
              </span>
            ))}
          </div>

          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7" onMouseLeave={() => setHoverDay(null)}>
              {week.map((day, di) => {
                if (!day) return <span key={di} className="h-7 w-7" />;
                const isStart = !!draftFrom && isSameDay(day, draftFrom);
                const isEnd = !!draftTo && isSameDay(day, draftTo);
                const inRange = !!draftFrom && !!draftTo && day > draftFrom && day < draftTo;

                // Live preview: once a start date is picked but before an
                // end date is committed, hovering shows what the range
                // would become on the next click (including the case where
                // the hovered day is before the start, which swaps like
                // handleDayClick does).
                const previewEnd = draftFrom && !draftTo ? hoverDay : null;
                const previewLow = previewEnd && draftFrom && previewEnd < draftFrom ? previewEnd : draftFrom;
                const previewHigh = previewEnd && draftFrom && previewEnd < draftFrom ? draftFrom : previewEnd;
                const inHoverPreview =
                  !!previewLow && !!previewHigh && day > previewLow && day < previewHigh;
                const isHoverEnd = !!previewEnd && isSameDay(day, previewEnd);
                const isToday = isSameDay(day, today);

                return (
                  <button
                    key={di}
                    type="button"
                    onClick={() => handleDayClick(day)}
                    onMouseEnter={() => setHoverDay(day)}
                    className={cn(
                      "mx-auto my-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm transition-colors",
                      !(isStart || isEnd || isHoverEnd) && "hover:bg-accent",
                      (isStart || isEnd) && "bg-primary text-primary-foreground hover:bg-primary/90",
                      inRange && !isStart && !isEnd && "rounded-none bg-primary/10",
                      (inHoverPreview || isHoverEnd) && !isStart && !isEnd && "rounded-none bg-primary/10",
                      isHoverEnd && !isStart && !isEnd && "rounded-full ring-2 ring-primary/60",
                      isToday && !isStart && !isEnd && "border border-primary/50"
                    )}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
          ))}

          <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
            <Button type="button" variant="ghost" size="sm" onClick={handleClearDraft}>
              Clear
            </Button>
            <Button type="button" size="sm" onClick={handleApply}>
              Apply
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
