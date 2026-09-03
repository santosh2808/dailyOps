import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  Eye,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
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
import LeadStatusBadge from "@/components/leads/LeadStatusBadge";
import LeadFiltersBar, { emptyLeadFilters, type LeadFilters } from "@/components/leads/LeadFiltersBar";
import DeleteLeadConfirmDialog from "@/components/leads/DeleteLeadConfirmDialog";
import ImportLeadsDialog from "@/components/leads/ImportLeadsDialog";
import { sourceLabel } from "@/components/leads/leadOptions";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import TruncatedText from "@/components/shared/TruncatedText";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { deleteLead, downloadLeadImportTemplate, listLeads } from "@/api/leads";
import type { Lead, LeadStatus } from "@/types";

const PAGE_SIZE = 20;

type SortableColumn = "leadNumber" | "nextFollowUp";

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

// Additive: Dashboard Redesign — lets a Dashboard card/chart link like
// `/leads?status=QUALIFIED` land here with that filter already applied.
// Only read once, on first mount (see useState lazy initializer below) —
// afterwards LeadFiltersBar owns the filter state as it always has.
function initialFiltersFromSearchParams(searchParams: URLSearchParams): LeadFilters {
  const status = searchParams.get("status");
  const assignedToUserId = searchParams.get("assignedToUserId");
  return {
    ...emptyLeadFilters,
    status: (status as LeadStatus | null) ?? emptyLeadFilters.status,
    assignedToUserId: assignedToUserId ?? emptyLeadFilters.assignedToUserId,
  };
}

export default function LeadList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<LeadFilters>(() =>
    initialFiltersFromSearchParams(searchParams),
  );
  const [debouncedFilters, setDebouncedFilters] = useState<LeadFilters>(() =>
    initialFiltersFromSearchParams(searchParams),
  );
  const [sortBy, setSortBy] = useState<SortableColumn>("leadNumber");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  // Bulk delete — select-multiple checkboxes in the table, scoped to the
  // rows currently on screen (see the reset effect below for why selection
  // doesn't persist across a page/filter/sort change).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listLeads({
        page,
        limit: PAGE_SIZE,
        search: debouncedFilters.search || undefined,
        status: debouncedFilters.status || undefined,
        priority: debouncedFilters.priority || undefined,
        source: debouncedFilters.source || undefined,
        assignedToUserId: debouncedFilters.assignedToUserId || undefined,
        dateFrom: debouncedFilters.dateFrom || undefined,
        dateTo: debouncedFilters.dateTo || undefined,
        sortBy,
        sortOrder,
      });
      setLeads(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch {
      setError("Failed to load leads.");
      toast.error("Failed to load leads.");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedFilters, sortBy, sortOrder]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Selection is scoped to whatever's currently on screen — clear it
  // whenever the page/filters/sort change so a stale id from a page the
  // user has left can't get silently deleted.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, debouncedFilters, sortBy, sortOrder]);

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

  function openDeleteDialog(lead: Lead) {
    setSelectedLead(lead);
    setDeleteOpen(true);
  }

  async function handleDeleteConfirm() {
    if (!selectedLead) return;
    await deleteLead(selectedLead.id);
    toast.success(`Lead "${selectedLead.leadNumber}" deleted.`);
    await fetchLeads();
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
      prev.size === leads.length ? new Set() : new Set(leads.map((l) => l.id))
    );
  }

  // Runs the existing single-delete endpoint per selected row rather than a
  // new bulk API — same result, and this list is a paginated admin table
  // (tens of rows at a time), not something at a scale where N requests is
  // a real cost. Uses allSettled so one lead a business rule blocks doesn't
  // stop the rest from deleting.
  async function handleBulkDeleteConfirm() {
    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(ids.map((id) => deleteLead(id)));
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - succeeded;
    if (succeeded > 0) {
      toast.success(`${succeeded} lead${succeeded === 1 ? "" : "s"} deleted.`);
    }
    if (failed > 0) {
      toast.error(`${failed} lead${failed === 1 ? "" : "s"} could not be deleted.`);
    }
    setSelectedIds(new Set());
    await fetchLeads();
  }

  async function handleDownloadTemplate() {
    setDownloadingTemplate(true);
    try {
      await downloadLeadImportTemplate();
    } catch {
      setError("Failed to download the import template.");
      toast.error("Failed to download the import template.");
    } finally {
      setDownloadingTemplate(false);
    }
  }

  return (
    <div className="flex h-screen bg-app-grid">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="Leads" showBackButton />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <LeadFiltersBar filters={filters} onChange={setFilters} />
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button variant="outline" onClick={handleDownloadTemplate} disabled={downloadingTemplate}>
                {downloadingTemplate ? (
                  <Spinner className="mr-2 h-4 w-4" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                {downloadingTemplate ? "Downloading..." : "Download Template"}
              </Button>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Import Leads
              </Button>
              <Button onClick={() => navigate("/leads/new")}>
                <Plus className="mr-2 h-4 w-4" />
                Create Lead
              </Button>
            </div>
          </div>

          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

          {selectedIds.size > 0 && (
            <div className="mb-3 flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-4 py-2">
              <p className="text-sm text-slate-700">
                {selectedIds.size} lead{selectedIds.size === 1 ? "" : "s"} selected
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

          {/* Lead Management Phase 1 (requirement #7) — exactly these
              columns: Lead No, Company, Contact, Phone, Email, Source,
              Assigned To, Status, Next Follow-up, Last Updated, Actions.
              Priority/Est. Value/Products still show on Lead Details. */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    ref={(el) => {
                      if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < leads.length;
                    }}
                    checked={leads.length > 0 && selectedIds.size === leads.length}
                    onChange={toggleSelectAll}
                    aria-label="Select all leads on this page"
                  />
                </TableHead>
                <TableHead>
                  <button
                    type="button"
                    className="flex items-center"
                    onClick={() => toggleSort("leadNumber")}
                  >
                    Lead No
                    {sortIcon("leadNumber")}
                  </button>
                </TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <button
                    type="button"
                    className="flex items-center"
                    onClick={() => toggleSort("nextFollowUp")}
                  >
                    Next Follow-up
                    {sortIcon("nextFollowUp")}
                  </button>
                </TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={13} className="py-8 text-center text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Spinner /> Loading leads...
                    </span>
                  </TableCell>
                </TableRow>
              ) : leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} className="py-8 text-center text-muted-foreground">
                    No leads found. Click "Create Lead" to add one.
                  </TableCell>
                </TableRow>
              ) : (
                leads.map((lead) => (
                  <TableRow key={lead.id} className="cursor-pointer" onClick={() => navigate(`/leads/${lead.id}`)}>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(lead.id)}
                        onChange={() => toggleSelected(lead.id)}
                        aria-label={`Select lead ${lead.leadNumber}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium text-slate-900">{lead.leadNumber}</TableCell>
                    <TableCell>
                      <TruncatedText text={lead.companyName || "-"} />
                    </TableCell>
                    <TableCell>
                      <TruncatedText text={lead.contactPerson || "-"} className="max-w-[160px]" />
                    </TableCell>
                    <TableCell>{lead.phone || "-"}</TableCell>
                    <TableCell>
                      <TruncatedText text={lead.email || "-"} />
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5">
                        {sourceLabel(lead.source)}
                        {lead.source === "WEBSITE" && lead.sourceWebsiteId && (
                          <Badge variant="info">Website</Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>{lead.state || "—"}</TableCell>
                    {/* Full name only — never the role — with an explicit
                        "Unassigned" label (not a bare dash) when no user is
                        assigned. */}
                    <TableCell>{lead.assignedToUser?.name || "Unassigned"}</TableCell>
                    <TableCell>
                      <LeadStatusBadge status={lead.status} />
                    </TableCell>
                    <TableCell>{formatDate(lead.nextFollowUp)}</TableCell>
                    <TableCell>{formatDate(lead.updatedAt)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="View details"
                          onClick={() => navigate(`/leads/${lead.id}`)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Edit lead"
                          onClick={() => navigate(`/leads/${lead.id}/edit`)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Delete lead"
                          onClick={() => openDeleteDialog(lead)}
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
                ? "0 leads"
                : `Showing ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, total)} of ${total} leads`}
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

      <DeleteLeadConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        lead={selectedLead}
        onConfirm={handleDeleteConfirm}
      />
      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={`Delete ${selectedIds.size} lead${selectedIds.size === 1 ? "" : "s"}?`}
        description="This will permanently delete the selected leads. This action cannot be undone."
        confirmLabel="Delete"
        confirmingLabel="Deleting..."
        onConfirm={handleBulkDeleteConfirm}
      />
      <ImportLeadsDialog open={importOpen} onOpenChange={setImportOpen} onImported={fetchLeads} />
    </div>
  );
}
