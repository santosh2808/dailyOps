import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { deleteLead, downloadLeadImportTemplate, listLeads } from "@/api/leads";
import type { Lead } from "@/types";

const PAGE_SIZE = 20;

type SortableColumn = "leadNumber" | "nextFollowUp";

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

export default function LeadList() {
  const navigate = useNavigate();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<LeadFilters>(emptyLeadFilters);
  const [debouncedFilters, setDebouncedFilters] = useState<LeadFilters>(emptyLeadFilters);
  const [sortBy, setSortBy] = useState<SortableColumn>("leadNumber");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

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
    } finally {
      setLoading(false);
    }
  }, [page, debouncedFilters, sortBy, sortOrder]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

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
    await fetchLeads();
  }

  async function handleDownloadTemplate() {
    setDownloadingTemplate(true);
    try {
      await downloadLeadImportTemplate();
    } catch {
      setError("Failed to download the import template.");
    } finally {
      setDownloadingTemplate(false);
    }
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="Leads" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <LeadFiltersBar filters={filters} onChange={setFilters} />
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button variant="outline" onClick={handleDownloadTemplate} disabled={downloadingTemplate}>
                <Download className="mr-2 h-4 w-4" />
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

          {/* Lead Management Phase 1 (requirement #7) — exactly these
              columns: Lead No, Company, Contact, Phone, Email, Source,
              Assigned To, Status, Next Follow-up, Last Updated, Actions.
              Priority/Est. Value/Products still show on Lead Details. */}
          <Table>
            <TableHeader>
              <TableRow>
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
                  <TableCell colSpan={11} className="py-8 text-center text-muted-foreground">
                    Loading leads...
                  </TableCell>
                </TableRow>
              ) : leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="py-8 text-center text-muted-foreground">
                    No leads found. Click "Create Lead" to add one.
                  </TableCell>
                </TableRow>
              ) : (
                leads.map((lead) => (
                  <TableRow key={lead.id} className="cursor-pointer" onClick={() => navigate(`/leads/${lead.id}`)}>
                    <TableCell className="font-medium text-slate-900">{lead.leadNumber}</TableCell>
                    <TableCell>{lead.companyName || "-"}</TableCell>
                    <TableCell>{lead.contactPerson || "-"}</TableCell>
                    <TableCell>{lead.phone || "-"}</TableCell>
                    <TableCell>{lead.email || "-"}</TableCell>
                    <TableCell>{sourceLabel(lead.source)}</TableCell>
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
      <ImportLeadsDialog open={importOpen} onOpenChange={setImportOpen} onImported={fetchLeads} />
    </div>
  );
}
