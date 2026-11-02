import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// The OS option picker for a native <select> (iOS wheel, Android full-screen
// sheet, the macOS list drawn over the field) is replaced by an in-page list
// anchored under the field, the same on every screen size. The real
// <select> stays underneath and is still what holds the value, ref,
// name/required and fires onChange — a transparent tap target over it opens
// the list instead, and picking an option sets the select's value and
// dispatches the same change event the OS picker would. So callers
// (value/onChange, refs, form validation, scrollToFirstError) work
// unchanged. Keyboard and screen-reader users, who reach the select itself
// (the tap target is aria-hidden and not focusable), keep its native
// behaviour.

interface MenuOption {
  value: string;
  label: string;
  disabled: boolean;
}

interface MenuState {
  options: MenuOption[];
  selected: string;
  style: React.CSSProperties;
}

const MENU_GAP = 4;
const VIEWPORT_MARGIN = 8;
const MENU_MAX_HEIGHT = 288;

// Below the field, or above it when there isn't room below — fixed to the
// viewport so no overflow container (cards, tables, dialogs) can clip it.
function menuPosition(rect: DOMRect): React.CSSProperties {
  const spaceBelow = window.innerHeight - rect.bottom - MENU_GAP - VIEWPORT_MARGIN;
  const spaceAbove = rect.top - MENU_GAP - VIEWPORT_MARGIN;
  const openUp = spaceBelow < Math.min(MENU_MAX_HEIGHT, 160) && spaceAbove > spaceBelow;
  const left = Math.max(VIEWPORT_MARGIN, rect.left);
  return {
    left,
    minWidth: rect.width,
    maxWidth: window.innerWidth - left - VIEWPORT_MARGIN,
    maxHeight: Math.min(MENU_MAX_HEIGHT, openUp ? spaceAbove : spaceBelow),
    ...(openUp ? { bottom: window.innerHeight - rect.top + MENU_GAP } : { top: rect.bottom + MENU_GAP }),
  };
}

const selectValueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => {
    // A multi-select has no single-pick list to show, so it keeps the OS one.
    const keepNativePicker = Boolean(props.multiple);
    const selectRef = React.useRef<HTMLSelectElement | null>(null);
    const tapTargetRef = React.useRef<HTMLButtonElement>(null);
    const menuRef = React.useRef<HTMLDivElement>(null);
    const [menu, setMenu] = React.useState<MenuState | null>(null);

    const setRefs = React.useCallback(
      (node: HTMLSelectElement | null) => {
        selectRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      },
      [ref]
    );

    function openMenu() {
      const select = selectRef.current;
      if (!select || select.disabled) return;
      setMenu({
        // Read from the DOM at open time, so the list always matches the
        // <option>s actually rendered (including hidden/disabled ones).
        options: Array.from(select.options)
          .filter((option) => !option.hidden)
          .map((option) => ({ value: option.value, label: option.text, disabled: option.disabled })),
        selected: select.value,
        style: menuPosition(select.getBoundingClientRect()),
      });
    }

    function choose(value: string) {
      setMenu(null);
      const select = selectRef.current;
      // Like the OS picker: re-picking the current option fires nothing.
      if (!select || select.value === value) return;
      // The prototype setter, then a real change event, so React's onChange
      // (controlled or not) sees it exactly as a user's own pick.
      selectValueSetter?.call(select, value);
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }

    React.useEffect(() => {
      if (!menu) return;
      const close = () => setMenu(null);
      function handlePointerDown(e: PointerEvent) {
        const target = e.target as Node;
        // The tap target toggles the list itself in its own click handler.
        if (menuRef.current?.contains(target) || tapTargetRef.current?.contains(target)) return;
        close();
      }
      function handleKeyDown(e: KeyboardEvent) {
        if (e.key === "Escape") close();
      }
      // The list is fixed in place, so it would drift off the field if the
      // page (or a scrolling dialog) moved under it — close instead.
      function handleScroll(e: Event) {
        if (!menuRef.current?.contains(e.target as Node)) close();
      }
      document.addEventListener("pointerdown", handlePointerDown);
      document.addEventListener("keydown", handleKeyDown);
      window.addEventListener("scroll", handleScroll, true);
      window.addEventListener("resize", close);
      menuRef.current?.querySelector<HTMLElement>("[aria-selected='true']")?.scrollIntoView({ block: "nearest" });
      return () => {
        document.removeEventListener("pointerdown", handlePointerDown);
        document.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("scroll", handleScroll, true);
        window.removeEventListener("resize", close);
      };
    }, [menu]);

    return (
      <div className="relative">
        <select
          ref={setRefs}
          className={cn(
            "flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            menu && "ring-2 ring-ring ring-offset-2",
            className
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        {!keepNativePicker && (
          <button
            ref={tapTargetRef}
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            disabled={props.disabled}
            // Keep focus where it is: focusing an aria-hidden element is
            // flagged by browsers, and the select itself must not get focus
            // either (iOS would open its own picker and zoom in).
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => (menu ? setMenu(null) : openMenu())}
            className="absolute inset-0 cursor-pointer rounded-md disabled:cursor-not-allowed"
          />
        )}
        {menu &&
          createPortal(
            <div
              ref={menuRef}
              role="listbox"
              style={menu.style}
              // Above Dialog (z-50), since a select can sit inside one.
              className="fixed z-[60] overflow-y-auto rounded-md border border-input bg-background p-1 shadow-md animate-in fade-in-0 zoom-in-95"
            >
              {menu.options.map((option, index) => {
                const isSelected = option.value === menu.selected;
                return (
                  <button
                    key={`${index}-${option.value}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={option.disabled}
                    onClick={() => choose(option.value)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-2.5 text-left text-sm transition-colors disabled:pointer-events-none disabled:opacity-50",
                      isSelected ? "bg-primary text-primary-foreground" : "text-slate-700 hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <span className="min-w-0 flex-1 break-words">{option.label}</span>
                    {isSelected && <Check className="h-4 w-4 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>,
            document.body
          )}
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };
