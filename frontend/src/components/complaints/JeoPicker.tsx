import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/errors";
import { listJobExecutionOrders } from "@/api/job-execution-orders";
import type { JobExecutionOrder } from "@/types";

// QA fix (JEO Number field): a searchable dropdown over Job Execution
// Orders (by JEO number or customer name), replacing SalesOrderPicker as the
// field a Complaint's required jeoId gets picked from on create — same
// interaction pattern as SalesOrderPicker itself.
interface JeoPickerProps {
  value?: string | null;
  selectedJeo?: JobExecutionOrder | null;
  onChange: (jeo: JobExecutionOrder | null) => void;
}

export default function JeoPicker({ value, selectedJeo, onChange }: JeoPickerProps) {
  const [results, setResults] = useState<JobExecutionOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchJeos = useCallback(async (query: string) => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await listJobExecutionOrders({ page: 1, limit: 20, search: query || undefined });
      setResults(res.data);
    } catch (err) {
      setLoadError(getErrorMessage(err, "Could not load job execution orders."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => fetchJeos(search), 300);
    return () => clearTimeout(handle);
  }, [open, search, fetchJeos]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(jeo: JobExecutionOrder) {
    onChange(jeo);
    setSearch("");
    setOpen(false);
  }

  function handleClear() {
    onChange(null);
    setSearch("");
    setOpen(false);
  }

  const displayValue = open ? search : selectedJeo?.jeoNumber ?? "";

  return (
    <div className="relative" ref={containerRef}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="pl-9 pr-8"
        placeholder="Search by JEO no. or customer name"
        value={displayValue}
        onFocus={() => {
          setOpen(true);
          setSearch("");
        }}
        onChange={(e) => setSearch(e.target.value)}
      />
      {selectedJeo && !open && (
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
            <p className="px-3 py-2 text-sm text-muted-foreground">No matching job execution orders.</p>
          ) : (
            results.map((jeo) => (
              <button
                key={jeo.id}
                type="button"
                className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                  jeo.id === value ? "bg-orange/10" : ""
                }`}
                onClick={() => handleSelect(jeo)}
              >
                <span className="font-medium text-slate-900">{jeo.jeoNumber}</span>
                <span className="text-xs text-muted-foreground">
                  {jeo.customer?.companyName ?? jeo.salesOrder?.customer?.companyName ?? "—"}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
