import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, Eye } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import JeoStatusBadge from "@/components/job-execution-orders/JeoStatusBadge";
import JeoPriorityBadge from "@/components/job-execution-orders/JeoPriorityBadge";
import JeoFiltersBar, {
  emptyJeoFilters,
  type JeoFilters,
} from "@/components/job-execution-orders/JeoFiltersBar";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { listJobExecutionOrders } from "@/api/job-execution-orders";
import type { JobExecutionOrder, JeoStatus } from "@/types";

const PAGE_SIZE = 20;

type SortableColumn = "jeoNumber" | "deliveryDate" | "priority";

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

// Additive: Dashboard Redesign — lets a Dashboard link like
// `/job-execution-orders?status=QC` land here with that filter already
// applied. Only read once, on first mount (see useState lazy initializer
// below).
function initialFiltersFromSearchParams(searchParams: URLSearchParams): JeoFilters {
  const status = searchParams.get("status");
  return { ...emptyJeoFilters, status: (status as JeoStatus | null) ?? emptyJeoFilters.status };
}

export default function JobExecutionOrderList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [jeos, setJeos] = useState<JobExecutionOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<JeoFilters>(() => initialFiltersFromSearchParams(searchParams));
  const [debouncedFilters, setDebouncedFilters] = useState<JeoFilters>(() =>
    initialFiltersFromSearchParams(searchParams),
  );
  const [sortBy, setSortBy] = useState<SortableColumn>("deliveryDate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchJeos = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listJobExecutionOrders({
        page,
        limit: PAGE_SIZE,
        search: debouncedFilters.search || undefined,
        status: debouncedFilters.status || undefined,
        priority: debouncedFilters.priority || undefined,
        dateFrom: debouncedFilters.dateFrom || undefined,
        dateTo: debouncedFilters.dateTo || undefined,
        sortBy,
        sortOrder,
      });
      setJeos(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch {
      setError("Failed to load job execution orders.");
      toast.error("Failed to load job execution orders.");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedFilters, sortBy, sortOrder]);

  useEffect(() => {
    fetchJeos();
  }, [fetchJeos]);

  // Debounce the whole filter object so typing in search / changing a
  // select don't each trigger their own separate request storm.
  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedFilters(filters);
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [filters]);

  function toggleSort(column: SortableColumn) {
    if (sortBy === column) {
      setSortOrder((order) => (order === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
  }

  function sortIcon(column: SortableColumn) {
    if (sortBy !== column) return <ArrowUpDown className="ml-1 h-3 w-3" />;
    return sortOrder === "asc" ? (
      <ArrowUp className="ml-1 h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3" />
    );
  }

  return (
    <div className="flex h-screen bg-app-grid">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="Job Execution Orders" showBackButton />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mb-4">
            <JeoFiltersBar filters={filters} onChange={setFilters} />
          </div>

          <p className="mb-3 text-xs text-muted-foreground">
            Job Execution Orders are generated from a Sales Order — open a sales order to generate
            one.
          </p>

          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button type="button" className="flex items-center" onClick={() => toggleSort("jeoNumber")}>
                    JEO Number
                    {sortIcon("jeoNumber")}
                  </button>
                </TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Sales Order</TableHead>
                <TableHead>
                  <button type="button" className="flex items-center" onClick={() => toggleSort("priority")}>
                    Priority
                    {sortIcon("priority")}
                  </button>
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <button
                    type="button"
                    className="flex items-center"
                    onClick={() => toggleSort("deliveryDate")}
                  >
                    Delivery Date
                    {sortIcon("deliveryDate")}
                  </button>
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Spinner /> Loading job execution orders...
                    </span>
                  </TableCell>
                </TableRow>
              ) : jeos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    No job execution orders found.
                  </TableCell>
                </TableRow>
              ) : (
                jeos.map((jeo) => (
                  <TableRow
                    key={jeo.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/job-execution-orders/${jeo.id}`)}
                  >
                    <TableCell className="font-medium text-slate-900">{jeo.jeoNumber}</TableCell>
                    <TableCell>{jeo.customer?.companyName ?? "—"}</TableCell>
                    <TableCell>{jeo.customer?.state ?? "—"}</TableCell>
                    <TableCell>{jeo.salesOrder?.salesOrderNumber ?? "—"}</TableCell>
                    <TableCell>
                      <JeoPriorityBadge priority={jeo.priority} />
                    </TableCell>
                    <TableCell>
                      <JeoStatusBadge status={jeo.status} />
                    </TableCell>
                    <TableCell>{formatDate(jeo.deliveryDate)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="View details"
                          onClick={() => navigate(`/job-execution-orders/${jeo.id}`)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-sm text-muted-foreground">
              {total === 0
                ? "0 job execution orders"
                : `Showing ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, total)} of ${total} job execution orders`}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
