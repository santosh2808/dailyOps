import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { deleteSalesOrder, listSalesOrders } from "@/api/sales-orders";
import type { SalesOrder } from "@/types";

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

export default function SalesOrderList() {
  const navigate = useNavigate();

  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<SalesOrderFilters>(emptySalesOrderFilters);
  const [debouncedFilters, setDebouncedFilters] = useState<SalesOrderFilters>(emptySalesOrderFilters);
  const [sortBy, setSortBy] = useState<SortableColumn>("orderDate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedSalesOrder, setSelectedSalesOrder] = useState<SalesOrder | null>(null);

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
        sortBy,
        sortOrder,
      });
      setSalesOrders(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch {
      setError("Failed to load sales orders.");
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
    await fetchSalesOrders();
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="Sales Orders" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <SalesOrderFiltersBar filters={filters} onChange={setFilters} />
          </div>

          <p className="mb-3 text-xs text-muted-foreground">
            Sales Orders are created from an Accepted Quotation — open a quotation with status
            "Accepted" to create one.
          </p>

          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

          <Table>
            <TableHeader>
              <TableRow>
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
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    Loading sales orders...
                  </TableCell>
                </TableRow>
              ) : salesOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
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
                    <TableCell className="font-medium text-slate-900">
                      {salesOrder.salesOrderNumber}
                    </TableCell>
                    <TableCell>{salesOrder.customer?.companyName ?? "—"}</TableCell>
                    <TableCell>{salesOrder.quotation?.quotationNumber ?? "—"}</TableCell>
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
    </div>
  );
}
