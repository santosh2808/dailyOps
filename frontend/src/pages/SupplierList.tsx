import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Eye, Pencil, Plus, Trash2, Upload } from "lucide-react";
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
import SupplierStatusBadge from "@/components/suppliers/SupplierStatusBadge";
import SupplierFiltersBar, {
  emptySupplierFilters,
  type SupplierFilters,
} from "@/components/suppliers/SupplierFiltersBar";
import DeleteSupplierConfirmDialog from "@/components/suppliers/DeleteSupplierConfirmDialog";
import ImportSupplierDialog from "@/components/suppliers/ImportSupplierDialog";
import { Checkbox } from "@/components/ui/checkbox";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import TruncatedText from "@/components/shared/TruncatedText";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import {
  deleteSupplier,
  downloadSupplierImportTemplate,
  exportSuppliers,
  listSuppliers,
} from "@/api/suppliers";
import type { Supplier } from "@/types";

const PAGE_SIZE = 20;

export default function SupplierList() {
  const navigate = useNavigate();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<SupplierFilters>(emptySupplierFilters);
  const [debouncedFilters, setDebouncedFilters] = useState<SupplierFilters>(emptySupplierFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listSuppliers({
        page,
        limit: PAGE_SIZE,
        search: debouncedFilters.search || undefined,
        status: debouncedFilters.status || undefined,
        country: debouncedFilters.country || undefined,
      });
      setSuppliers(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch {
      setError("Failed to load suppliers.");
      toast.error("Failed to load suppliers.");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedFilters]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  // Debounce the whole filter object so typing in search / changing a
  // select don't each trigger their own separate request storm — same
  // convention as LeadList.
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

  function openDeleteDialog(supplier: Supplier) {
    setSelectedSupplier(supplier);
    setDeleteOpen(true);
  }

  async function handleDeleteConfirm() {
    if (!selectedSupplier) return;
    await deleteSupplier(selectedSupplier.id);
    toast.success(`Supplier "${selectedSupplier.supplierName}" deleted.`);
    await fetchSuppliers();
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
      prev.size === suppliers.length ? new Set() : new Set(suppliers.map((s) => s.id))
    );
  }

  async function handleBulkDeleteConfirm() {
    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(ids.map((id) => deleteSupplier(id)));
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - succeeded;
    if (succeeded > 0) {
      toast.success(`${succeeded} supplier${succeeded === 1 ? "" : "s"} deleted.`);
    }
    if (failed > 0) {
      toast.error(`${failed} supplier${failed === 1 ? "" : "s"} could not be deleted.`);
    }
    setSelectedIds(new Set());
    await fetchSuppliers();
  }

  async function handleDownloadTemplate() {
    setDownloadingTemplate(true);
    try {
      await downloadSupplierImportTemplate();
    } catch {
      toast.error("Failed to download the import template.");
    } finally {
      setDownloadingTemplate(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      await exportSuppliers();
      toast.success("Suppliers exported.");
    } catch {
      toast.error("Failed to export suppliers.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex h-screen bg-app-grid">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="Suppliers" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <SupplierFiltersBar filters={filters} onChange={setFilters} />
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
                Import Excel
              </Button>
              <Button variant="outline" onClick={handleExport} disabled={exporting}>
                {exporting ? <Spinner className="mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4" />}
                {exporting ? "Exporting..." : "Export Excel"}
              </Button>
              <Button onClick={() => navigate("/suppliers/new")}>
                <Plus className="mr-2 h-4 w-4" />
                Add Supplier
              </Button>
            </div>
          </div>

          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

          {selectedIds.size > 0 && (
            <div className="mb-3 flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-4 py-2">
              <p className="text-sm text-slate-700">
                {selectedIds.size} supplier{selectedIds.size === 1 ? "" : "s"} selected
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
                      if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < suppliers.length;
                    }}
                    checked={suppliers.length > 0 && selectedIds.size === suppliers.length}
                    onChange={toggleSelectAll}
                    aria-label="Select all suppliers on this page"
                  />
                </TableHead>
                <TableHead>Supplier Code</TableHead>
                <TableHead>Supplier Name</TableHead>
                <TableHead>Contact Person</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Spinner /> Loading suppliers...
                    </span>
                  </TableCell>
                </TableRow>
              ) : suppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                    No suppliers found. Click "Add Supplier" to create one.
                  </TableCell>
                </TableRow>
              ) : (
                suppliers.map((supplier) => (
                  <TableRow
                    key={supplier.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/suppliers/${supplier.id}`)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(supplier.id)}
                        onChange={() => toggleSelected(supplier.id)}
                        aria-label={`Select supplier ${supplier.supplierName}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium text-slate-900">
                      {supplier.supplierCode}
                    </TableCell>
                    <TableCell>
                      <TruncatedText text={supplier.supplierName} />
                    </TableCell>
                    <TableCell>{supplier.contactPerson || "—"}</TableCell>
                    <TableCell>{supplier.phone || "—"}</TableCell>
                    <TableCell>{supplier.email || "—"}</TableCell>
                    <TableCell>{supplier.city || "—"}</TableCell>
                    <TableCell>{supplier.country || "—"}</TableCell>
                    <TableCell>
                      <SupplierStatusBadge status={supplier.status} />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="View details"
                          onClick={() => navigate(`/suppliers/${supplier.id}`)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Edit supplier"
                          onClick={() => navigate(`/suppliers/${supplier.id}/edit`)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Delete supplier"
                          onClick={() => openDeleteDialog(supplier)}
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
                ? "0 suppliers"
                : `Showing ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, total)} of ${total} suppliers`}
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

      <DeleteSupplierConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        supplier={selectedSupplier}
        onConfirm={handleDeleteConfirm}
      />
      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={`Delete ${selectedIds.size} supplier${selectedIds.size === 1 ? "" : "s"}?`}
        description="This will permanently delete the selected suppliers. This action cannot be undone."
        confirmLabel="Delete"
        confirmingLabel="Deleting..."
        onConfirm={handleBulkDeleteConfirm}
      />
      <ImportSupplierDialog open={importOpen} onOpenChange={setImportOpen} onImported={fetchSuppliers} />
    </div>
  );
}
