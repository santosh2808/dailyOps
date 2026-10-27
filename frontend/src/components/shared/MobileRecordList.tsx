import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { MOBILE_ACCORDION } from "@/lib/featureFlags";
import { cn } from "@/lib/utils";

// EXPERIMENT — see MOBILE_ACCORDION in lib/featureFlags.ts.
//
// <ResponsiveRecords table={<Table …/>} mobile={<MobileRecordList …/>} />
// With the flag off (the default) it renders `table` alone — byte-for-byte
// the committed markup, at every width. With the flag on, the table stays
// the md+ presentation and MobileRecordList replaces it below md.
//
// MobileRecordList is presentation only: each page passes the rows it
// already fetched plus render functions built from the same expressions
// its table cells use, and its existing selection/sort state and action
// buttons. No data fetching, filtering or business rules live here.
export function ResponsiveRecords({ table, mobile }: { table: ReactNode; mobile: ReactNode }) {
  if (!MOBILE_ACCORDION) return <>{table}</>;
  return (
    <>
      <div className="hidden md:block">{table}</div>
      <div className="md:hidden">{mobile}</div>
    </>
  );
}

export interface RecordField<T> {
  label: string;
  render: (row: T) => ReactNode;
}

export interface RecordSortOption {
  value: string;
  label: string;
}

interface MobileRecordListProps<T> {
  rows: T[];
  getKey: (row: T) => string;
  // Collapsed card: identifier, then status badge on the right, then a
  // secondary line (customer/company) and an optional small meta line.
  title: (row: T) => ReactNode;
  badge?: (row: T) => ReactNode;
  subtitle?: (row: T) => ReactNode;
  meta?: (row: T) => ReactNode;
  // Expanded card: label/value pairs, then the row's actions.
  fields: RecordField<T>[];
  actions?: (row: T) => ReactNode;
  loading: boolean;
  loadingText: string;
  emptyText: ReactNode;
  // Mirrors the table's checkbox column + header select-all.
  selection?: {
    selected: Set<string>;
    onToggle: (key: string) => void;
    onToggleAll: () => void;
    rowLabel: (row: T) => string;
    // Rows the table renders with a disabled checkbox (e.g. protected roles).
    isSelectable?: (row: T) => boolean;
  };
  // Mirrors the table's sortable column headers, driving the page's own
  // sortBy/sortOrder state (cards have no column headers to click).
  sort?: {
    options: RecordSortOption[];
    by: string;
    order: "asc" | "desc";
    onChange: (by: string, order: "asc" | "desc") => void;
  };
}

export function MobileRecordList<T>({
  rows,
  getKey,
  title,
  badge,
  subtitle,
  meta,
  fields,
  actions,
  loading,
  loadingText,
  emptyText,
  selection,
  sort,
}: MobileRecordListProps<T>) {
  // One card open at a time; a key that's no longer on the page (after
  // paging/filtering) simply matches nothing.
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const baseId = useId();

  const selectableCount = selection?.isSelectable ? rows.filter(selection.isSelectable).length : rows.length;
  const allSelected = !!selection && selectableCount > 0 && selection.selected.size === selectableCount;
  const someSelected = !!selection && selection.selected.size > 0 && !allSelected;

  return (
    <div className="space-y-2">
      {(selection || sort) && rows.length > 0 && !loading && (
        <div className="flex items-center justify-between gap-3">
          {selection ? (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                checked={allSelected}
                onChange={selection.onToggleAll}
                aria-label="Select all on this page"
              />
              Select all
            </label>
          ) : (
            <span />
          )}
          {sort && (
            <Select
              className="h-9 w-auto max-w-[14rem] text-sm"
              aria-label="Sort by"
              value={`${sort.by}:${sort.order}`}
              onChange={(e) => {
                const [by, order] = e.target.value.split(":");
                sort.onChange(by, order as "asc" | "desc");
              }}
            >
              {/* Page default sort that isn't one of the header-sortable
                  columns (e.g. invoiceDate) — shown, not re-selectable. */}
              {!sort.options.some((o) => o.value === sort.by) && (
                <option value={`${sort.by}:${sort.order}`} disabled>
                  Default order
                </option>
              )}
              {sort.options.flatMap((o) => [
                <option key={`${o.value}:asc`} value={`${o.value}:asc`}>
                  {o.label} ↑
                </option>,
                <option key={`${o.value}:desc`} value={`${o.value}:desc`}>
                  {o.label} ↓
                </option>,
              ])}
            </Select>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border bg-white py-8 text-sm text-muted-foreground">
          <Spinner /> {loadingText}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border bg-white px-4 py-8 text-center text-sm text-muted-foreground">{emptyText}</div>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const key = getKey(row);
            const open = expandedKey === key;
            const panelId = `${baseId}-${key}`;
            return (
              <li key={key} className={cn("rounded-lg border bg-white", open && "ring-1 ring-primary/30")}>
                <div className="flex items-start">
                  {selection && (
                    <div className="py-3.5 pl-3">
                      <Checkbox
                        checked={selection.selected.has(key)}
                        onChange={() => selection.onToggle(key)}
                        disabled={selection.isSelectable ? !selection.isSelectable(row) : false}
                        aria-label={selection.rowLabel(row)}
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-start gap-2 p-3 text-left"
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => setExpandedKey(open ? null : key)}
                  >
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0 break-words font-medium text-slate-900 [overflow-wrap:anywhere]">
                          {title(row)}
                        </span>
                        {badge && <span className="flex-shrink-0">{badge(row)}</span>}
                      </span>
                      {subtitle && (
                        <span className="line-clamp-2 block break-words text-sm text-slate-700 [overflow-wrap:anywhere]">
                          {subtitle(row)}
                        </span>
                      )}
                      {meta && <span className="block text-xs text-muted-foreground">{meta(row)}</span>}
                    </span>
                    <ChevronDown
                      className={cn("mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground motion-safe:transition-transform", open && "rotate-180")}
                      aria-hidden="true"
                    />
                  </button>
                </div>

                {open && (
                  <div id={panelId} className="border-t px-3 pb-2 pt-3">
                    <dl className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 gap-y-2 text-sm">
                      {fields.map((field) => (
                        <div key={field.label} className="contents">
                          <dt className="text-muted-foreground">{field.label}</dt>
                          <dd className="min-w-0 break-words text-slate-900 [overflow-wrap:anywhere]">
                            {field.render(row)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    {actions && (
                      <div className="mt-3 flex flex-wrap items-center justify-end gap-1 border-t pt-2">{actions(row)}</div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
