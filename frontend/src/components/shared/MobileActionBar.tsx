import type { ComponentType } from "react";
import { MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";

// Phone-only (below md) version of a list page's action-button row: the
// page's main action plus a ⋮ menu holding the secondary actions, so the
// actions never wrap onto extra rows. Pages keep their existing button row
// for md+ (hidden below md with max-md:hidden) and pass the same handlers
// here — no logic of its own.
//   layout="inline" — sits in the FilterPanel's Filters row (compact size)
//   layout="bar"    — its own row (pages without a Filters row)
export interface MobileAction {
  label: string;
  // Shorter label for very narrow phones, where the full one plus the
  // Filters button (with its active-count badge) and ⋮ can't share a row.
  shortLabel?: string;
  // Viewport width below which shortLabel replaces label. Measured: "Create
  // Lead"/"Add Supplier" fit down to 360px with a filter badge showing,
  // "Create Quotation" down to 390px.
  shortBelow?: 360 | 390;
  icon: ComponentType<{ className?: string }>;
  onSelect: () => void;
  disabled?: boolean;
  // A download/export in progress. The menu closes on tap, so the ⋮
  // trigger shows the spinner instead.
  busy?: boolean;
}

// Literal class strings so Tailwind generates them.
const SHORT_BELOW = {
  360: { full: "max-[359px]:hidden", short: "hidden max-[359px]:inline" },
  390: { full: "max-[389px]:hidden", short: "hidden max-[389px]:inline" },
} as const;

interface MobileActionBarProps {
  // Omitted when the user lacks permission for it (same rule as md+).
  primary?: MobileAction | null;
  more: MobileAction[];
  layout?: "inline" | "bar";
}

export default function MobileActionBar({ primary, more, layout = "bar" }: MobileActionBarProps) {
  const busy = more.some((a) => a.busy);
  const inline = layout === "inline";

  return (
    <div className="flex items-center gap-2 md:hidden">
      {primary && (
        <Button
          size={inline ? "sm" : "default"}
          className={inline ? undefined : "flex-1"}
          onClick={primary.onSelect}
          disabled={primary.disabled}
          aria-label={primary.shortLabel ? primary.label : undefined}
        >
          <primary.icon className="mr-1.5 h-4 w-4" />
          {primary.shortLabel ? (
            <>
              <span className={SHORT_BELOW[primary.shortBelow ?? 360].full}>{primary.label}</span>
              <span className={SHORT_BELOW[primary.shortBelow ?? 360].short}>{primary.shortLabel}</span>
            </>
          ) : (
            primary.label
          )}
        </Button>
      )}
      {more.length > 0 && (
        // Anchored to the side the trigger sits on so the menu never runs
        // off the screen edge.
        <DropdownMenu
          align={primary || inline ? "end" : "start"}
          trigger={
            <Button
              variant="outline"
              size="icon"
              className={inline ? "h-9 w-9" : undefined}
              title="More actions"
              aria-label="More actions"
              aria-haspopup="menu"
            >
              {busy ? <Spinner className="h-4 w-4" /> : <MoreVertical className="h-4 w-4" />}
            </Button>
          }
        >
          {more.map((action) => (
            <DropdownMenuItem key={action.label} icon={action.icon} onSelect={action.onSelect} disabled={action.disabled}>
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenu>
      )}
    </div>
  );
}
