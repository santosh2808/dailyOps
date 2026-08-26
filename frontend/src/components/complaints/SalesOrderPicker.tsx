import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { listSalesOrders } from "@/api/sales-orders";
import type { SalesOrder } from "@/types";

// Complaints module: a searchable dropdown over Sales Orders (by order
// number or customer name), same interaction pattern as AssignedToPicker —
// this is how a Complaint's required salesOrderId gets picked on create.
interface SalesOrderPickerProps {
  value?: string | null;
  selectedSalesOrder?: SalesOrder | null;
  onChange: (salesOrder: SalesOrder | null) => void;
}

export default function SalesOrderPicker({ value, selectedSalesOrder, onChange }: SalesOrderPickerProps) {
  const [results, setResults] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchOrders = useCallback(async (query: string) => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await listSalesOrders({ page: 1, limit: 20, search: query || undefined });
      setResults(res.data);
    } catch {
      setLoadError("Could not load sales orders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => fetchOrders(search), 300);
    return () => clearTimeout(handle);
  }, [open, search, fetchOrders]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(order: SalesOrder) {
    onChange(order);
    setSearch("");
    setOpen(false);
  }

  function handleClear() {
    onChange(null);
    setSearch("");
    setOpen(false);
  }

  const displayValue = open ? search : selectedSalesOrder?.salesOrderNumber ?? "";

  return (
    <div className="relative" ref={containerRef}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="pl-9 pr-8"
        placeholder="Search by sales order no. or customer name"
        value={displayValue}
        onFocus={() => {
          setOpen(true);
          setSearch("");
        }}
        onChange={(e) => setSearch(e.target.value)}
      />
      {selectedSalesOrder && !open && (
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-slate-900"
          onClick={handleClear}
          title="Clear"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-white shadow-md">
          {loading ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Searching...</p>
          ) : loadError ? (
            <p className="px-3 py-2 text-sm text-destructive">{loadError}</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">No matching sales orders.</p>
          ) : (
            results.map((order) => (
              <button
                key={order.id}
                type="button"
                className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                  order.id === value ? "bg-orange/10" : ""
                }`}
                onClick={() => handleSelect(order)}
              >
                <span className="font-medium text-slate-900">{order.salesOrderNumber}</span>
                <span className="text-xs text-muted-foreground">
                  {order.customer?.companyName ?? "—"}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
