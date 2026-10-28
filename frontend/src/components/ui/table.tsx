import * as React from "react";
import { cn } from "@/lib/utils";

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  // List pages only (inside <main className="app-shell-main app-shell-main-list">,
  // see index.css): below md the wrapper shrinks to the height left under
  // the page's filters/actions and scrolls its rows itself, with a sticky
  // header row. min-h-48 keeps a few rows usable when a tall expanded
  // filter panel eats most of a small screen — <main> then scrolls as the
  // fallback. No effect at md and up.
  fillHeightOnMobile?: boolean;
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, fillHeightOnMobile = false, ...props }, ref) => (
    <div
      className={cn(
        "w-full overflow-auto rounded-md border",
        fillHeightOnMobile &&
          "max-md:min-h-48 max-md:overscroll-contain max-md:[&_thead]:sticky max-md:[&_thead]:top-0 max-md:[&_thead]:z-10 max-md:[&_thead]:shadow-[inset_0_-1px_0_hsl(var(--border))]"
      )}
    >
      <table ref={ref} className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  )
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("bg-slate-50 [&_tr]:border-b", className)} {...props} />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
));
TableBody.displayName = "TableBody";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn("border-b transition-colors hover:bg-muted/50", className)}
      {...props}
    />
  )
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-10 px-4 text-left align-middle text-xs font-medium uppercase tracking-wide text-muted-foreground",
      className
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td ref={ref} className={cn("px-4 py-3 align-middle", className)} {...props} />
));
TableCell.displayName = "TableCell";

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
