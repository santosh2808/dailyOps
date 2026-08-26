import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// One shared spinner for the whole app — inline in buttons, table loading
// rows, and page-level loaders (see PageLoader) — so every loading state
// uses the same animation instead of static "Loading..." text.
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin", className)} aria-hidden="true" />;
}
