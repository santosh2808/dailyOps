import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast, useToasts, type ToastVariant } from "@/lib/toast";

const VARIANT_BORDER: Record<ToastVariant, string> = {
  success: "border-srm-green/40",
  error: "border-destructive/40",
  info: "border-sky-400/40",
};

const VARIANT_ICON_CLASS: Record<ToastVariant, string> = {
  success: "text-srm-green",
  error: "text-destructive",
  info: "text-sky-500",
};

const VARIANT_ICON = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
} satisfies Record<ToastVariant, typeof CheckCircle2>;

// Mounted once at the app root (see App.tsx) — fixed-position overlay, so
// every page gets toasts without importing anything itself.
export default function Toaster() {
  const items = useToasts();

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
      {items.map((item) => {
        const Icon = VARIANT_ICON[item.variant];
        return (
          <div
            key={item.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-lg border bg-white p-3 shadow-lg animate-in slide-in-from-bottom-2 fade-in",
              VARIANT_BORDER[item.variant],
            )}
          >
            <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", VARIANT_ICON_CLASS[item.variant])} />
            <div className="flex-1 text-sm">
              {item.title && <p className="font-medium text-slate-900">{item.title}</p>}
              <p className="text-muted-foreground">{item.description}</p>
            </div>
            <button
              type="button"
              onClick={() => toast.dismiss(item.id)}
              className="text-muted-foreground hover:text-slate-900"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
