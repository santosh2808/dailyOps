import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, Pencil, Trash2 } from "lucide-react";
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
import SalesOrderStatusBadge from "@/components/sales-orders/SalesOrderStatusBadge";
import SalesOrderFiltersBar, {
  emptySalesOrderFilters,
  type SalesOrderFilters,
} from "@/components/sales-orders/SalesOrderFiltersBar";
import DeleteSalesOrderConfirmDialog from "@/components/sales-orders/DeleteSalesOrderConfirmDialog";
import { Checkbox } from "@/components/ui/checkbox";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import TruncatedText from "@/components/shared/TruncatedText";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { deleteSalesOrder, listSalesOrders } from "@/api/sales-orders";
import type { SalesOrder, SalesOrderStatus } from "@/types";

const PAGE_SIZE = 20;

type SortableColumn = "salesOrderNumber" | "grandTotal" | "orderDate" | "deliveryDate";

function formatCurrency(value?: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

// Additive: Dashboard Redesign — lets a Dashboard link like
// `/sales-orders?status=READY_FOR_DISPATCH` land here with that filter
// already applied. Only read once, on first mount (see useState lazy
// initializer below).
function initialFiltersFromSearchParams(searchParams: URLSearchParams): SalesOrderFilters {
  const status = searchParams.get("status");
  return {
    ...emptySalesOrderFilters,
    status: (status as SalesOrderStatus | null) ?? emptySalesOrderFilters.status,
    dateFrom: searchParams.get("dateFrom") ?? emptySalesOrderFilters.dateFrom,
    dateTo: searchParams.get("dateTo") ?? emptySalesOrderFilters.dateTo,
    customerState: searchParams.get("customerState") ?? emptySalesOrderFilters.customerState,
    createdBy: searchParams.get("createdBy") ?? emptySalesOrderFilters.createdBy,
    productId: searchParams.get("productId") ?? emptySalesOrderFilters.productId,
  };
}

export default function SalesOrderList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<SalesOrderFilters>(() =>
    initialFiltersFromSearchParams(searchParams),
  );
  const [debouncedFilters, setDebouncedFilters] = useState<SalesOrderFilters>(() =>
    initialFiltersFromSearchParams(searchParams),
  );
  const [sortBy, setSortBy] = useState<SortableColumn>("orderDate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedSalesOrder, setSelectedSalesOrder] = useState<SalesOrder | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const fetchSalesOrders = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listSalesOrders({
        page,
        limit: PAGE_SIZE,
        search: debouncedFilters.search || undefined,
        status: debouncedFilters.status || undefined,
        dateFrom: debouncedFilters.dateFrom || undefined,
        dateTo: debouncedFilters.dateTo || undefined,
        customerState: debouncedFilters.customerState || undefined,
        createdBy: debouncedFilters.createdBy || undefined,
        productId: debouncedFilters.productId || undefined,
        sortBy,
        sortOrder,
      });
      setSalesOrders(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch {
      setError("Failed to load sales orders.");
      toast.error("Failed to load sales orders.");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedFilters, sortBy, sortOrder]);

  useEffect(() => {
    fetchSalesOrders();
  }, [fetchSalesOrders]);

  // Debounce the whole filter object so typing in search / changing a
  // select don't each trigger their own separate request storm.
  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedFilters(filters);
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [filters]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, debouncedFilters, sortBy, sortOrder]);

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

  function openDeleteDialog(salesOrder: SalesOrder) {
    setSelectedSalesOrder(salesOrder);
    setDeleteOpen(true);
  }

  async function handleDeleteConfirm() {
    if (!selectedSalesOrder) return;
    await deleteSalesOrder(selectedSalesOrder.id);
    toast.success(`Sales Order "${selectedSalesOrder.salesOrderNumber}" deleted.`);
    await fetchSalesOrders();
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) =>
      prev.size === salesOrders.length ? new Set() : new Set(salesOrders.map((s) => s.id))
    );
  }

  async function handleBulkDeleteConfirm() {
    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(ids.map((id) => deleteSalesOrder(id)));
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - succeeded;
    if (succeeded > 0) {
      toast.success(`${succeeded} sales order${succeeded === 1 ? "" : "s"} deleted.`);
    }
    if (failed > 0) {
      toast.error(`${failed} sales order${failed === 1 ? "" : "s"} could not be deleted.`);
    }
    setSelectedIds(new Set());
    await fetchSalesOrders();
  }

  return (
    <div className="flex h-screen bg-app-grid">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="Sales Orders" showBackButton />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <SalesOrderFiltersBar filters={filters} onChange={setFilters} />
          </div>

          {(filters.customerState || filters.createdBy || filters.productId) && (
            <div className="mb-3 flex flex-wrap gap-2">
              {filters.customerState && (
                <div className="flex items-center gap-2 rounded-md bg-srm-green/10 px-3 py-1.5 text-sm font-medium text-srm-green">
                  State: {filters.customerState}
                  <button
                    type="button"
                    onClick={() => setFilters({ ...filters, customerState: "" })}
                    aria-label="Clear state filter"
                    className="text-srm-green/70 hover:text-srm-green"
                  >
                    ×
                  </button>
                </div>
              )}
              {filters.createdBy && (
                <div className="flex items-center gap-2 rounded-md bg-srm-green/10 px-3 py-1.5 text-sm font-medium text-srm-green">
                  Executive: {filters.createdBy}
                  <button
                    type="button"
                    onClick={() => setFilters({ ...filters, createdBy: "" })}
                    aria-label="Clear executive filter"
                    className="text-srm-green/70 hover:text-srm-green"
                  >
                    ×
                  </button>
                </div>
              )}
              {filters.productId && (
                <div className="flex items-center gap-2 rounded-md bg-srm-green/10 px-3 py-1.5 text-sm font-medium text-srm-green">
                  Product filter applied
                  <button
                    type="button"
                    onClick={() => setFilters({ ...filters, productId: "" })}
                    aria-label="Clear product filter"
                    className="text-srm-green/70 hover:text-srm-green"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          )}

          <p className="mb-3 text-xs text-muted-foreground">
            Sales Orders are created from an Accepted Quotation — open a quotation with status
            "Accepted" to create one.
          </p>

          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

          {selectedIds.size > 0 && (
            <div className="mb-3 flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-4 py-2">
              <p className="text-sm text-slate-700">
                {selectedIds.size} sales order{selectedIds.size === 1 ? "" : "s"} selected
              </p>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                  Clear
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Selected
                </Button>
              </div>
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    ref={(el) => {
                      if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < salesOrders.length;
                    }}
                    checked={salesOrders.length > 0 && selectedIds.size === salesOrders.length}
                    onChange={toggleSelectAll}
                    aria-label="Select all sales orders on this page"
                  />
                </TableHead>
                <TableHead>
                  <button
                    type="button"
                    className="flex items-center"
                    onClick={() => toggleSort("salesOrderNumber")}
                  >
                    Order Number
                    {sortIcon("salesOrderNumber")}
                  </button>
                </TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Quotation</TableHead>
                <TableHead>Sales Executive</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <button
                    type="button"
                    className="flex items-center"
                    onClick={() => toggleSort("grandTotal")}
                  >
                    Grand Total
                    {sortIcon("grandTotal")}
                  </button>
                </TableHead>
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
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Spinner /> Loading sales orders...
                    </span>
                  </TableCell>
                </TableRow>
              ) : salesOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                    No sales orders found.
                  </TableCell>
                </TableRow>
              ) : (
                salesOrders.map((salesOrder) => (
                  <TableRow
                    key={salesOrder.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/sales-orders/${salesOrder.id}`)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(salesOrder.id)}
                        onChange={() => toggleSelected(salesOrder.id)}
                        aria-label={`Select sales order ${salesOrder.salesOrderNumber}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium text-slate-900">
                      {salesOrder.salesOrderNumber}
                    </TableCell>
                    <TableCell>
                      <TruncatedText text={salesOrder.customer?.companyName ?? "—"} />
                    </TableCell>
                    <TableCell>{salesOrder.quotation?.quotationNumber ?? "—"}</TableCell>
                    <TableCell>{salesOrder.createdBy ?? "—"}</TableCell>
                    <TableCell>
                      <SalesOrderStatusBadge status={salesOrder.status} />
                    </TableCell>
                    <TableCell>{formatCurrency(salesOrder.grandTotal)}</TableCell>
                    <TableCell>{formatDate(salesOrder.deliveryDate)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="View details"
                          onClick={() => navigate(`/sales-orders/${salesOrder.id}`)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Edit sales order"
                          onClick={() => navigate(`/sales-orders/${salesOrder.id}/edit`)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Delete sales order"
                          onClick={() => openDeleteDialog(salesOrder)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
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
                ? "0 sales orders"
                : `Showing ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, total)} of ${total} sales orders`}
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

      <DeleteSalesOrderConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        salesOrder={selectedSalesOrder}
        onConfirm={handleDeleteConfirm}
      />
      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={`Delete ${selectedIds.size} sales order${selectedIds.size === 1 ? "" : "s"}?`}
        description="This will permanently delete the selected sales orders. This action cannot be undone."
        confirmLabel="Delete"
        confirmingLabel="Deleting..."
        onConfirm={handleBulkDeleteConfirm}
      />
    </div>
  );
}
