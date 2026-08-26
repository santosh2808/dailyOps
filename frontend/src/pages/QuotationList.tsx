import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, Pencil, Plus, Trash2 } from "lucide-react";
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
import QuotationStatusBadge from "@/components/quotations/QuotationStatusBadge";
import QuotationFiltersBar, {
  emptyQuotationFilters,
  type QuotationFilters,
} from "@/components/quotations/QuotationFiltersBar";
import DeleteQuotationConfirmDialog from "@/components/quotations/DeleteQuotationConfirmDialog";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { deleteQuotation, listQuotations } from "@/api/quotations";
import type { Quotation, QuotationStatus } from "@/types";

const PAGE_SIZE = 20;

type SortableColumn = "quotationNumber" | "grandTotal" | "validUntil";

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
// `/quotations?status=ACCEPTED` land here with that filter already
// applied. Only read once, on first mount (see useState lazy initializer
// below).
function initialFiltersFromSearchParams(searchParams: URLSearchParams): QuotationFilters {
  const status = searchParams.get("status");
  return { ...emptyQuotationFilters, status: (status as QuotationStatus | null) ?? emptyQuotationFilters.status };
}

export default function QuotationList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<QuotationFilters>(() =>
    initialFiltersFromSearchParams(searchParams),
  );
  const [debouncedFilters, setDebouncedFilters] = useState<QuotationFilters>(() =>
    initialFiltersFromSearchParams(searchParams),
  );
  const [sortBy, setSortBy] = useState<SortableColumn>("quotationNumber");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);

  const fetchQuotations = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listQuotations({
        page,
        limit: PAGE_SIZE,
        search: debouncedFilters.search || undefined,
        status: debouncedFilters.status || undefined,
        dateFrom: debouncedFilters.dateFrom || undefined,
        dateTo: debouncedFilters.dateTo || undefined,
        sortBy,
        sortOrder,
      });
      setQuotations(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch {
      setError("Failed to load quotations.");
      toast.error("Failed to load quotations.");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedFilters, sortBy, sortOrder]);

  useEffect(() => {
    fetchQuotations();
  }, [fetchQuotations]);

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

  function openDeleteDialog(quotation: Quotation) {
    setSelectedQuotation(quotation);
    setDeleteOpen(true);
  }

  async function handleDeleteConfirm() {
    if (!selectedQuotation) return;
    await deleteQuotation(selectedQuotation.id);
    toast.success(`Quotation "${selectedQuotation.quotationNumber}" deleted.`);
    await fetchQuotations();
  }

  return (
    <div className="flex h-screen bg-app-grid">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="Quotations" showBackButton />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <QuotationFiltersBar filters={filters} onChange={setFilters} />
            <Button onClick={() => navigate("/quotations/new")} className="shrink-0">
              <Plus className="mr-2 h-4 w-4" />
              Create Quotation
            </Button>
          </div>

          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button
                    type="button"
                    className="flex items-center"
                    onClick={() => toggleSort("quotationNumber")}
                  >
                    Quotation Number
                    {sortIcon("quotationNumber")}
                  </button>
                </TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Items</TableHead>
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
                    <span className="inline-flex items-center gap-2">
                      <Spinner /> Loading quotations...
                    </span>
                  </TableCell>
                </TableRow>
              ) : quotations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No quotations found. Click "Create Quotation" to add one.
                  </TableCell>
                </TableRow>
              ) : (
                quotations.map((quotation) => (
                  <TableRow
                    key={quotation.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/quotations/${quotation.id}`)}
                  >
                    <TableCell className="font-medium text-slate-900">
                      {quotation.quotationNumber}
                    </TableCell>
                    <TableCell>{quotation.customer?.companyName ?? "—"}</TableCell>
                    <TableCell>
                      <QuotationStatusBadge status={quotation.status} />
                    </TableCell>
                    <TableCell>{quotation._count?.items ?? 0}</TableCell>
                    <TableCell>{formatCurrency(quotation.grandTotal)}</TableCell>
                    <TableCell>{formatDate(quotation.validUntil)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="View details"
                          onClick={() => navigate(`/quotations/${quotation.id}`)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Edit quotation"
                          onClick={() => navigate(`/quotations/${quotation.id}/edit`)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Delete quotation"
                          onClick={() => openDeleteDialog(quotation)}
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
                ? "0 quotations"
                : `Showing ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, total)} of ${total} quotations`}
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

      <DeleteQuotationConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        quotation={selectedQuotation}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
