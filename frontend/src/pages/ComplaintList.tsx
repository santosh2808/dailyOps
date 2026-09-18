import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Eye, Pencil, Plus, Trash2 } from "lucide-react";
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
import ComplaintStatusBadge from "@/components/complaints/ComplaintStatusBadge";
import ComplaintFiltersBar, {
  emptyComplaintFilters,
  type ComplaintFilters,
} from "@/components/complaints/ComplaintFiltersBar";
import DeleteComplaintConfirmDialog from "@/components/complaints/DeleteComplaintConfirmDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import TruncatedText from "@/components/shared/TruncatedText";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/errors";
import { deleteComplaint, exportComplaints, listComplaints } from "@/api/complaints";
import type { Complaint, ComplaintStatus } from "@/types";
import { useAuth } from "@/context/AuthContext";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

// Bug fix (TC-061): the three backend-sortable fields (see
// ComplaintsService's SORTABLE_FIELDS) that this list exposes as clickable
// headers. "Age (days)" sorts by createdAt — it's the date-like column this
// list shows (there's no separate "Logged On" column), and age is
// monotonic with createdAt for the common unresolved case.
type SortableColumn = "complaintNumber" | "status" | "createdAt";

// Additive: Dashboard's Open Complaints KPI links here as
// `/complaints?status=OPEN` — read once on first mount, same convention as
// SalesOrderList's initialFiltersFromSearchParams().
function initialFiltersFromSearchParams(searchParams: URLSearchParams): ComplaintFilters {
  const status = searchParams.get("status");
  return {
    ...emptyComplaintFilters,
    status: (status as ComplaintStatus | null) ?? emptyComplaintFilters.status,
  };
}

export default function ComplaintList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // QA bug-fix pass (TC-078/082/095): backend already rejects unauthorized
  // Complaint creation — this just hides the action from a role that can't use it.
  const { hasPermission } = useAuth();

  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [filters, setFilters] = useState<ComplaintFilters>(() =>
    initialFiltersFromSearchParams(searchParams),
  );
  const [debouncedFilters, setDebouncedFilters] = useState<ComplaintFilters>(() =>
    initialFiltersFromSearchParams(searchParams),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  // Bug fix (TC-061): sortable "Complaint No." / "Status" / "Age (days)"
  // headers — defaults match the backend's own default (createdAt/desc).
  const [sortBy, setSortBy] = useState<SortableColumn>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const fetchComplaints = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listComplaints({
        page,
        limit: pageSize,
        search: debouncedFilters.search || undefined,
        status: debouncedFilters.status || undefined,
        // Bug fix (TC-057): pass the new filter bar fields through.
        assignedToUserId: debouncedFilters.assignedToUserId || undefined,
        departmentId: debouncedFilters.departmentId || undefined,
        source: debouncedFilters.source || undefined,
        sourceWebsiteId: debouncedFilters.sourceWebsiteId || undefined,
        sourceSubjectCode: debouncedFilters.sourceSubjectCode || undefined,
        warrantyVerificationStatus: debouncedFilters.warrantyVerificationStatus || undefined,
        dateFrom: debouncedFilters.dateFrom || undefined,
        dateTo: debouncedFilters.dateTo || undefined,
        sortBy,
        sortOrder,
      });
      setComplaints(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err) {
      const message = getErrorMessage(err, "Failed to load complaints.");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedFilters, sortBy, sortOrder]);

  useEffect(() => {
    fetchComplaints();
  }, [fetchComplaints]);

  // Debounce the whole filter object so typing in search / changing a
  // select don't each trigger their own separate request storm — same
  // convention as SupplierList/LeadList.
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
    return sortOrder === "asc" ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />;
  }

  function handlePageSizeChange(next: number) {
    setPageSize(next);
    setPage(1);
  }

  async function handleExport() {
    setExporting(true);
    try {
      await exportComplaints({
        search: debouncedFilters.search || undefined,
        status: debouncedFilters.status || undefined,
        assignedToUserId: debouncedFilters.assignedToUserId || undefined,
        departmentId: debouncedFilters.departmentId || undefined,
        source: debouncedFilters.source || undefined,
        sourceWebsiteId: debouncedFilters.sourceWebsiteId || undefined,
        sourceSubjectCode: debouncedFilters.sourceSubjectCode || undefined,
        warrantyVerificationStatus: debouncedFilters.warrantyVerificationStatus || undefined,
        dateFrom: debouncedFilters.dateFrom || undefined,
        dateTo: debouncedFilters.dateTo || undefined,
        sortBy,
        sortOrder,
      });
      toast.success("Complaints exported.");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to export complaints."));
    } finally {
      setExporting(false);
    }
  }

  function openDeleteDialog(complaint: Complaint) {
    setSelectedComplaint(complaint);
    setDeleteOpen(true);
  }

  async function handleDeleteConfirm() {
    if (!selectedComplaint) return;
    await deleteComplaint(selectedComplaint.id);
    toast.success(`Complaint ${selectedComplaint.complaintNumber} deleted.`);
    await fetchComplaints();
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
      prev.size === complaints.length ? new Set() : new Set(complaints.map((c) => c.id))
    );
  }

  async function handleBulkDeleteConfirm() {
    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(ids.map((id) => deleteComplaint(id)));
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - succeeded;
    if (succeeded > 0) {
      toast.success(`${succeeded} complaint${succeeded === 1 ? "" : "s"} deleted.`);
    }
    if (failed > 0) {
      toast.error(`${failed} complaint${failed === 1 ? "" : "s"} could not be deleted.`);
    }
    setSelectedIds(new Set());
    await fetchComplaints();
  }

  return (
    <div className="flex h-screen bg-app-grid">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Bug fix (TC-087): this is a top-level Sidebar destination, not
            reached from anywhere with a predictable "back" target — Topbar's
            showBackButton calls navigate(-1), which is confusing here (same
            reasoning already applied to Details pages under TC-085). Other
            top-level list pages (Suppliers, Customers, etc.) already have no
            back button; this one and the others below were the outliers. */}
        <Topbar title="Complaints" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <ComplaintFiltersBar filters={filters} onChange={setFilters} />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleExport} disabled={exporting}>
                {exporting ? <Spinner className="mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4" />}
                {exporting ? "Exporting..." : "Export Excel"}
              </Button>
              {hasPermission("Complaint", "Create") && (
                <Button onClick={() => navigate("/complaints/new")}>
                  <Plus className="mr-2 h-4 w-4" />
                  Log Complaint
                </Button>
              )}
            </div>
          </div>

          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

          {selectedIds.size > 0 && (
            <div className="mb-3 flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-4 py-2">
              <p className="text-sm text-slate-700">
                {selectedIds.size} complaint{selectedIds.size === 1 ? "" : "s"} selected
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
                      if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < complaints.length;
                    }}
                    checked={complaints.length > 0 && selectedIds.size === complaints.length}
                    onChange={toggleSelectAll}
                    aria-label="Select all complaints on this page"
                  />
                </TableHead>
                <TableHead>
                  <button type="button" className="flex items-center" onClick={() => toggleSort("complaintNumber")}>
                    Complaint No.
                    {sortIcon("complaintNumber")}
                  </button>
                </TableHead>
                <TableHead>Subject</TableHead>
                {/* Bug fix: lower-priority columns now progressively
                    appear from md/lg/xl up instead of all nine always being
                    rendered at once, which forced a horizontal scroll on
                    anything narrower than a wide desktop monitor. */}
                {/* Bug fix (TC-060): Source/Sales Order/Customer merged into
                    one combined "Origin" column — a Source badge stacked
                    above the sales order + customer (or reporter) text. */}
                <TableHead className="hidden md:table-cell">Origin</TableHead>
                <TableHead className="hidden lg:table-cell">Invoice / Warranty</TableHead>
                {/* Bug fix (TC-059): who/which department this complaint is
                    assigned to, and how long it's been open/took to resolve. */}
                <TableHead className="hidden xl:table-cell">Assigned To</TableHead>
                <TableHead className="hidden xl:table-cell">
                  <button type="button" className="flex items-center" onClick={() => toggleSort("createdAt")}>
                    Age (days)
                    {sortIcon("createdAt")}
                  </button>
                </TableHead>
                <TableHead>
                  <button type="button" className="flex items-center" onClick={() => toggleSort("status")}>
                    Status
                    {sortIcon("status")}
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
                      <Spinner /> Loading complaints...
                    </span>
                  </TableCell>
                </TableRow>
              ) : complaints.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                    No complaints found. Click "Log Complaint" to create one.
                  </TableCell>
                </TableRow>
              ) : (
                complaints.map((complaint) => {
                  const proformaInvoice = complaint.salesOrder?.proformaInvoices?.[0];
                  const customerName =
                    complaint.salesOrder?.customer?.companyName || complaint.reporterName || "—";
                  // Bug fix (TC-060): a Proforma Invoice's number was
                  // previously shown identically, unstyled, to a verified
                  // Tax Invoice number — a user could easily mistake one for
                  // the other. Now distinct from both the verified case
                  // (plain) and the unverified-claimed case.
                  const invoiceDisplay = complaint.taxInvoice
                    ? complaint.taxInvoice.invoiceNumber
                    : proformaInvoice?.invoiceNumber
                      ? `${proformaInvoice.invoiceNumber} (Proforma)`
                      : complaint.claimedInvoiceNumber
                        ? `${complaint.claimedInvoiceNumber} (unverified)`
                        : "—";
                  const originText = complaint.salesOrder
                    ? `${complaint.salesOrder.salesOrderNumber} — ${customerName}`
                    : customerName !== "—"
                      ? customerName
                      : "—";
                  // Bug fix (TC-060): same warranty badge semantics as
                  // ComplaintDetails.tsx's Invoice Verification card —
                  // success when under warranty, destructive when expired
                  // or the automatic check found no matching invoice,
                  // nothing when still unverified with no claim at all.
                  const warrantyBadge = complaint.warranty ? (
                    <Badge variant={complaint.warranty.isUnderWarranty ? "success" : "destructive"}>
                      {complaint.warranty.isUnderWarranty ? "Under Warranty" : "Warranty Expired"}
                    </Badge>
                  ) : complaint.warrantyVerificationStatus === "NOT_FOUND" ? (
                    <Badge variant="destructive">Not Found</Badge>
                  ) : null;
                  return (
                    <TableRow
                      key={complaint.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/complaints/${complaint.id}`)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(complaint.id)}
                          onChange={() => toggleSelected(complaint.id)}
                          aria-label={`Select complaint ${complaint.complaintNumber}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium text-slate-900">
                        {complaint.complaintNumber}
                      </TableCell>
                      <TableCell>
                        <TruncatedText text={complaint.subject} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="space-y-1">
                          <Badge
                            variant={
                              complaint.source === "WEB_FORM"
                                ? "info"
                                : complaint.source === "CONVERTED_FROM_LEAD"
                                  ? "warning"
                                  : "muted"
                            }
                          >
                            {complaint.source.replace(/_/g, " ")}
                          </Badge>
                          <div>
                            <TruncatedText text={originText} />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="space-y-1">
                          <div>{invoiceDisplay}</div>
                          {warrantyBadge}
                        </div>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">{complaint.assignedToUser?.name || "—"}</TableCell>
                      <TableCell className="hidden xl:table-cell">{complaint.ageInDays}</TableCell>
                      <TableCell>
                        <ComplaintStatusBadge status={complaint.status} />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="View details"
                            onClick={() => navigate(`/complaints/${complaint.id}`)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Edit complaint"
                            onClick={() => navigate(`/complaints/${complaint.id}/edit`)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Delete complaint"
                            onClick={() => openDeleteDialog(complaint)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-sm text-muted-foreground">
              {total === 0
                ? "0 complaints"
                : `Showing ${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, total)} of ${total} complaints`}
            </p>
            <div className="flex items-center gap-3">
              {/* Bug fix (TC-061): page-size selector — resets to page 1 on change. */}
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                Rows per page
                <select
                  className="flex h-8 rounded-md border border-input bg-background px-2 text-sm"
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
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

      <DeleteComplaintConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        complaint={selectedComplaint}
        onConfirm={handleDeleteConfirm}
      />
      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={`Delete ${selectedIds.size} complaint${selectedIds.size === 1 ? "" : "s"}?`}
        description="This will permanently delete the selected complaints. This action cannot be undone."
        confirmLabel="Delete"
        confirmingLabel="Deleting..."
        onConfirm={handleBulkDeleteConfirm}
      />
    </div>
  );
}
