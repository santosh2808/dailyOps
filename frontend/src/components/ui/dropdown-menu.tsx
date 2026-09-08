import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Lightweight, dependency-free dropdown menu (no @radix-ui in this project —
// every other primitive in this folder is hand-rolled too, see dialog.tsx/
// select.tsx). Built specifically to get crowded page-header action rows
// (View PDF / Send / Change Status / Edit / Delete, all inline) down to one
// primary button + a single "More actions" trigger, so the button row never
// has enough items left to awkwardly wrap onto its own line.
interface DropdownMenuProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
}

export function DropdownMenu({ trigger, children, align = "end", className }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
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

  return (
    <div ref={rootRef} className="relative inline-block text-left">
      <span onClick={() => setOpen((o) => !o)}>{trigger}</span>
      {open && (
        <div
          role="menu"
          // onClick here closes the menu after any item's own onSelect has
          // already run (React bubbles inner-to-outer), without every item
          // needing to remember to close it itself.
          onClick={() => setOpen(false)}
          className={cn(
            "absolute z-50 mt-1 min-w-[190px] overflow-hidden rounded-md border border-input bg-background p-1 shadow-md animate-in fade-in-0 zoom-in-95",
            align === "end" ? "right-0" : "left-0",
            className
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

interface DropdownMenuItemProps {
  onSelect?: () => void;
  icon?: ComponentType<{ className?: string }>;
  destructive?: boolean;
  disabled?: boolean;
  children: ReactNode;
}

export function DropdownMenuItem({ onSelect, icon: Icon, destructive, disabled, children }: DropdownMenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors disabled:pointer-events-none disabled:opacity-50",
        destructive
          ? "text-destructive hover:bg-destructive/10"
          : "text-slate-700 hover:bg-accent hover:text-accent-foreground"
      )}
    >
      {Icon && <Icon className="h-4 w-4 flex-shrink-0" />}
      <span className="truncate">{children}</span>
    </button>
  );
}

export function DropdownMenuSeparator({ className }: { className?: string } = {}) {
  return <div className={cn("my-1 h-px bg-border", className)} />;
}
