import { useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The filter-controls row shared by every list page's *FiltersBar (the
// search box stays outside it, always visible).
//
// md and up: renders exactly the row those bars used to inline — controls
// in a wrapping row, then a "Clear filters" button while any are active.
//
// Below md: the row collapses behind a "Filters" toggle (with an active
// count and a Clear action beside it), and when expanded every control is
// stacked full-width. Controls keep their own desktop widths (w-40 etc.);
// the [&>*] / [&_select] overrides below stretch them on phones only, so
// callers don't need per-control responsive classes. Native <select>s are
// kept on purpose: the OS renders their option list, which can't be
// clipped by an overflow container or run off the viewport.
//
// mobileActions (optional, below md only): the page's main action + ⋮ menu
// (MobileActionBar layout="inline"), placed on the right of the Filters
// row. The Clear action then moves into the expanded panel, because
// Filters + Clear + actions don't fit one row on a 320px screen.
interface FilterPanelProps {
  activeCount: number;
  onClear: () => void;
  children: ReactNode;
  mobileActions?: ReactNode;
}

export default function FilterPanel({ activeCount, onClear, children, mobileActions }: FilterPanelProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="max-md:space-y-3">
      <div className="flex items-center justify-between gap-2 md:hidden">
        <Button
          variant="outline"
          size="sm"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
        >
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          Filters
          {activeCount > 0 && (
            <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
              {activeCount}
            </span>
          )}
          {open ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />}
        </Button>
        {mobileActions ??
          (activeCount > 0 && (
            <Button variant="ghost" size="sm" onClick={onClear}>
              <X className="mr-1 h-3.5 w-3.5" />
              Clear
            </Button>
          ))}
      </div>

      <div
        id={panelId}
        className={cn(
          open ? "flex" : "hidden",
          "flex-col gap-2 md:flex md:flex-row md:flex-wrap md:items-center",
          "max-md:[&>*]:w-full max-md:[&_select]:w-full"
        )}
      >
        {children}
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" className={mobileActions ? undefined : "hidden md:inline-flex"} onClick={onClear}>
            <X className="mr-1 h-3.5 w-3.5" />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
