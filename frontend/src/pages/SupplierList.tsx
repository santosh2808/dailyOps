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

  function openDeleteDialog(supplier: Supplier) {
    setSelectedSupplier(supplier);
    setDeleteOpen(true);
  }

  async function handleDeleteConfirm() {
    if (!selectedSupplier) return;
    await deleteSupplier(selectedSupplier.id);
    await fetchSuppliers();
  }

  async function handleDownloadTemplate() {
    setDownloadingTemplate(true);
    try {
      await downloadSupplierImportTemplate();
    } catch {
      setError("Failed to download the import template.");
    } finally {
      setDownloadingTemplate(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      await exportSuppliers();
    } catch {
      setError("Failed to export suppliers.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="Suppliers" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <SupplierFiltersBar filters={filters} onChange={setFilters} />
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button variant="outline" onClick={handleDownloadTemplate} disabled={downloadingTemplate}>
                <Download className="mr-2 h-4 w-4" />
                {downloadingTemplate ? "Downloading..." : "Download Template"}
              </Button>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Import Excel
              </Button>
              <Button variant="outline" onClick={handleExport} disabled={exporting}>
                <Download className="mr-2 h-4 w-4" />
                {exporting ? "Exporting..." : "Export Excel"}
              </Button>
              <Button onClick={() => navigate("/suppliers/new")}>
                <Plus className="mr-2 h-4 w-4" />
                Add Supplier
              </Button>
            </div>
          </div>

          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

          <Table>
            <TableHeader>
              <TableRow>
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
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                    Loading suppliers...
                  </TableCell>
                </TableRow>
              ) : suppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
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
                    <TableCell className="font-medium text-slate-900">
                      {supplier.supplierCode}
                    </TableCell>
                    <TableCell>{supplier.supplierName}</TableCell>
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
      <ImportSupplierDialog open={importOpen} onOpenChange={setImportOpen} onImported={fetchSuppliers} />
    </div>
  );
}
