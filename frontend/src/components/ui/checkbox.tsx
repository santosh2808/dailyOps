import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Plain <input type="checkbox"> under the hood (no Radix in this project —
// see select.tsx/dialog.tsx for the same native-element convention),
// restyled to match the rest of the UI kit.
export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, ...props }, ref) => (
    <span className="relative inline-flex h-4 w-4 flex-shrink-0 items-center justify-center">
      <input
        type="checkbox"
        ref={ref}
        checked={checked}
        className={cn(
          "peer h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-sm border border-input bg-background checked:border-primary checked:bg-primary disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
      <Check className="pointer-events-none absolute h-3 w-3 scale-0 text-primary-foreground peer-checked:scale-100" />
    </span>
  )
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
