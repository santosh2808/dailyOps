import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
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
import { deleteComplaint, listComplaints } from "@/api/complaints";
import type { Complaint, ComplaintStatus } from "@/types";

const PAGE_SIZE = 20;

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

  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<ComplaintFilters>(() =>
    initialFiltersFromSearchParams(searchParams),
  );
  const [debouncedFilters, setDebouncedFilters] = useState<ComplaintFilters>(() =>
    initialFiltersFromSearchParams(searchParams),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
        limit: PAGE_SIZE,
        search: debouncedFilters.search || undefined,
        status: debouncedFilters.status || undefined,
      });
      setComplaints(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch {
      setError("Failed to load complaints.");
      toast.error("Failed to load complaints.");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedFilters]);

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
  }, [page, debouncedFilters]);

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
        <Topbar title="Complaints" showBackButton />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <ComplaintFiltersBar filters={filters} onChange={setFilters} />
            <Button onClick={() => navigate("/complaints/new")}>
              <Plus className="mr-2 h-4 w-4" />
              Log Complaint
            </Button>
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
                <TableHead>Complaint No.</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Sales Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Status</TableHead>
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
                  const invoiceDisplay = complaint.taxInvoice
                    ? complaint.taxInvoice.invoiceNumber
                    : proformaInvoice?.invoiceNumber
                      ? proformaInvoice.invoiceNumber
                      : complaint.claimedInvoiceNumber
                        ? `${complaint.claimedInvoiceNumber} (unverified)`
                        : "—";
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
                      <TableCell>
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
                      </TableCell>
                      <TableCell>{complaint.salesOrder?.salesOrderNumber || "—"}</TableCell>
                      <TableCell>
                        <TruncatedText text={customerName} />
                      </TableCell>
                      <TableCell>{invoiceDisplay}</TableCell>
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
                : `Showing ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, total)} of ${total} complaints`}
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
