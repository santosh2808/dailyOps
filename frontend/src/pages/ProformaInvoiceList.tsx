import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import ProformaInvoiceStatusBadge from "@/components/proforma-invoices/ProformaInvoiceStatusBadge";
import ProformaInvoiceFiltersBar, {
  emptyProformaInvoiceFilters,
  type ProformaInvoiceFilters,
} from "@/components/proforma-invoices/ProformaInvoiceFiltersBar";
import { listProformaInvoices } from "@/api/proforma-invoices";
import type { ProformaInvoice } from "@/types";

const PAGE_SIZE = 20;

type SortableColumn = "invoiceNumber" | "grandTotal" | "invoiceDate" | "validUntil";

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

export default function ProformaInvoiceList() {
  const navigate = useNavigate();

  const [invoices, setInvoices] = useState<ProformaInvoice[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<ProformaInvoiceFilters>(emptyProformaInvoiceFilters);
  const [debouncedFilters, setDebouncedFilters] = useState<ProformaInvoiceFilters>(emptyProformaInvoiceFilters);
  const [sortBy, setSortBy] = useState<SortableColumn>("invoiceDate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listProformaInvoices({
        page,
        limit: PAGE_SIZE,
        search: debouncedFilters.search || undefined,
        status: debouncedFilters.status || undefined,
        dateFrom: debouncedFilters.dateFrom || undefined,
        dateTo: debouncedFilters.dateTo || undefined,
        sortBy,
        sortOrder,
      });
      setInvoices(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch {
      setError("Failed to load proforma invoices.");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedFilters, sortBy, sortOrder]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

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
        <Topbar title="Proforma Invoices" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mb-4">
            <ProformaInvoiceFiltersBar filters={filters} onChange={setFilters} />
          </div>

          <p className="mb-3 text-xs text-muted-foreground">
            Proforma Invoices are generated from a Sales Order — open a sales order to generate one.
          </p>

          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button
                    type="button"
                    className="flex items-center"
                    onClick={() => toggleSort("invoiceNumber")}
                  >
                    Invoice Number
                    {sortIcon("invoiceNumber")}
                  </button>
                </TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Sales Order</TableHead>
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
                    onClick={() => toggleSort("validUntil")}
                  >
                    Valid Until
                    {sortIcon("validUntil")}
                  </button>
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    Loading proforma invoices...
                  </TableCell>
                </TableRow>
              ) : invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No proforma invoices found.
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((invoice) => (
                  <TableRow
                    key={invoice.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/proforma-invoices/${invoice.id}`)}
                  >
                    <TableCell className="font-medium text-slate-900">
                      {invoice.invoiceNumber}
                    </TableCell>
                    <TableCell>{invoice.customer?.companyName ?? "—"}</TableCell>
                    <TableCell>{invoice.salesOrder?.salesOrderNumber ?? "—"}</TableCell>
                    <TableCell>
                      <ProformaInvoiceStatusBadge status={invoice.status} />
                    </TableCell>
                    <TableCell>{formatCurrency(invoice.grandTotal)}</TableCell>
                    <TableCell>{formatDate(invoice.validUntil)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="View details"
                          onClick={() => navigate(`/proforma-invoices/${invoice.id}`)}
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
                ? "0 proforma invoices"
                : `Showing ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, total)} of ${total} proforma invoices`}
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
