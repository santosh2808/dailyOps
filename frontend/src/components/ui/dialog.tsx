import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  // TC-092: every dialog defaults to z-50, same as the mobile Sidebar
  // drawer and Topbar's profile DropdownMenu — normally a non-issue since
  // a dialog is always mounted after those in the DOM and wins the tie,
  // but that's fragile (relies on mount order, not an actual stacking
  // guarantee). Optional escape hatch for a dialog that needs to
  // guarantee it's always on top regardless of where/when it's mounted —
  // e.g. "z-[60]". Omitting it (every other dialog today) keeps the
  // existing z-50 exactly as it was.
  overlayClassName?: string;
}

// See the inert-toggling effect inside Dialog below.
let openDialogCount = 0;

function Dialog({ open, onOpenChange, children, overlayClassName }: DialogProps) {
  // QA re-fail (TC-092): "other dropdowns and fields should not overlap or
  // appear above the popup" — a background native <select> (e.g. Color /
  // Hanging Structure on the Quotation form) can still be focused and
  // opened while a dialog is showing, and its OS-rendered option list is
  // painted in the browser's own top layer, completely outside any web
  // page's z-index stacking — no overlayClassName override can ever win
  // against it. The only reliable fix is to stop the background from being
  // interactive at all while a dialog is open, so a native select never
  // gets the chance to open in the first place: mark the app root inert
  // (unfocusable, unclickable) for the duration.
  //
  // This only works because the dialog itself is portaled to
  // document.body below, i.e. outside #root — marking #root inert while
  // the dialog is still rendered inside it would disable the dialog's own
  // buttons too. Runs for every dialog in the app, not just this one,
  // since the same native-select escape applies anywhere a dialog can be
  // opened over a page with a <select> on it.
  //
  // Ref-counted (openDialogCount below, module-scoped) rather than a plain
  // on/off toggle: a confirm dialog opened from within another dialog
  // (e.g. a delete confirmation over a form) means two Dialog instances
  // can be mounted-and-open at once — if each just set/removed the
  // attribute independently, the inner one closing first would strip
  // inert while the outer one is still open, reopening this exact bug.
  React.useEffect(() => {
    if (!open) return;
    openDialogCount += 1;
    const root = document.getElementById("root");
    root?.setAttribute("inert", "");
    return () => {
      openDialogCount -= 1;
      if (openDialogCount <= 0) {
        openDialogCount = 0;
        root?.removeAttribute("inert");
      }
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      // overflow-y-auto + items-start on the outer scroll container (with
      // items-center restored from sm up) is what lets a dialog taller
      // than the viewport actually be reached on a short/mobile screen —
      // items-center alone with no scroll clips anything past the edges
      // with no way to get to it. py-8 keeps a tall dialog from touching
      // the very top/bottom edge when it does scroll.
      className={cn(
        "fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 py-8 sm:items-center",
        overlayClassName
      )}
      onClick={() => onOpenChange(false)}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full">
        {children}
      </div>
    </div>,
    document.body
  );
}

// Bug fix (consistency pass): every dialog in the app used to pick its own
// one-off max-w-* class by hand (or none, silently falling back to a bare
// default) — the result was popups that were visibly different widths for
// no content reason, drifting further apart every time a new one got added.
// This is now the one place dialog width comes from — pick a `size` below
// instead of passing a max-w-* className:
//   sm  (384px)  — confirmations / single yes-or-no or one-field actions
//   md  (512px)  — default; everyday single-column forms (unchanged from
//                  this component's old hardcoded width, so anything that
//                  doesn't pass `size` looks exactly as it did before)
//   lg  (672px)  — forms with a two-column field grid (needs the extra
//                  width so the grid doesn't cram itself into a narrow
//                  dialog — see ProductFormDialog/CustomerFormDialog/etc.)
//   xl  (768px)  — import/bulk dialogs with a data preview table
const dialogSizes = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-3xl",
} as const;

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  onClose?: () => void;
  size?: keyof typeof dialogSizes;
}

const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, onClose, size = "md", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative mx-auto w-full rounded-lg border bg-card p-6 shadow-lg",
        dialogSizes[size],
        className
      )}
      {...props}
    >
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {children}
    </div>
  )
);
DialogContent.displayName = "DialogContent";

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mb-4 space-y-1", className)} {...props} />
);

const DialogTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h2 className={cn("text-lg font-semibold text-slate-900", className)} {...props} />
);

const DialogDescription = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn("text-sm text-muted-foreground", className)} {...props} />
);

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mt-6 flex justify-end gap-2", className)} {...props} />
);

export {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
};
