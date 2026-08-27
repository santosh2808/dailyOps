import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Download, Eye, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import MaterialStockBadge from "@/components/materials/MaterialStockBadge";
import DeleteMaterialConfirmDialog from "@/components/materials/DeleteMaterialConfirmDialog";
import ImportMaterialsDialog from "@/components/materials/ImportMaterialsDialog";
import { Checkbox } from "@/components/ui/checkbox";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import TruncatedText from "@/components/shared/TruncatedText";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { deactivateMaterial, exportMaterials, listMaterials } from "@/api/materials";
import type { Material } from "@/types";

const PAGE_SIZE = 20;

function formatCurrency(value?: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

type StockStatus = "low_stock" | "out_of_stock";

function isStockStatus(value: string | null): value is StockStatus {
  return value === "low_stock" || value === "out_of_stock";
}

const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  low_stock: "Low Stock",
  out_of_stock: "Out of Stock",
};

export default function MaterialList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [materials, setMaterials] = useState<Material[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // Additive: Dashboard Redesign — lets a Dashboard link like
  // `/materials?stockStatus=low_stock` land here with that filter already
  // applied (Materials had no stock-status filter UI at all before this).
  const [stockStatus, setStockStatus] = useState<StockStatus | null>(() => {
    const value = searchParams.get("stockStatus");
    return isStockStatus(value) ? value : null;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listMaterials({
        page,
        limit: PAGE_SIZE,
        search: debouncedSearch || undefined,
        stockStatus: stockStatus ?? undefined,
      });
      setMaterials(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch {
      setError("Failed to load materials.");
      toast.error("Failed to load materials.");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, stockStatus]);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, debouncedSearch, stockStatus]);

  function openDeleteDialog(material: Material) {
    setSelectedMaterial(material);
    setDeleteOpen(true);
  }

  async function handleDeleteConfirm() {
    if (!selectedMaterial) return;
    await deactivateMaterial(selectedMaterial.id);
    toast.success(`Material "${selectedMaterial.materialCode}" deleted.`);
    await fetchMaterials();
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
      prev.size === materials.length ? new Set() : new Set(materials.map((m) => m.id))
    );
  }

  async function handleBulkDeleteConfirm() {
    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(ids.map((id) => deactivateMaterial(id)));
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - succeeded;
    if (succeeded > 0) {
      toast.success(`${succeeded} material${succeeded === 1 ? "" : "s"} deleted.`);
    }
    if (failed > 0) {
      toast.error(`${failed} material${failed === 1 ? "" : "s"} could not be deleted.`);
    }
    setSelectedIds(new Set());
    await fetchMaterials();
  }

  async function handleExport() {
    setExporting(true);
    try {
      await exportMaterials();
      toast.success("Materials exported.");
    } catch {
      setError("Failed to export materials.");
      toast.error("Failed to export materials.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex h-screen bg-app-grid">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="Materials" showBackButton />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by code, name, or description"
                className="pl-9"
              />
            </div>
            {stockStatus && (
              <div className="flex items-center gap-2 rounded-md bg-srm-green/10 px-3 py-1.5 text-sm font-medium text-srm-green">
                {STOCK_STATUS_LABEL[stockStatus]}
                <button
                  type="button"
                  onClick={() => setStockStatus(null)}
                  aria-label="Clear stock status filter"
                  className="text-srm-green/70 hover:text-srm-green"
                >
                  ×
                </button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Import Excel
              </Button>
              <Button variant="outline" onClick={handleExport} disabled={exporting}>
                {exporting ? (
                  <Spinner className="mr-2 h-4 w-4" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                {exporting ? "Exporting..." : "Export Excel"}
              </Button>
              <Button onClick={() => navigate("/materials/new")}>
                <Plus className="mr-2 h-4 w-4" />
                Create Material
              </Button>
            </div>
          </div>

          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

          {selectedIds.size > 0 && (
            <div className="mb-3 flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-4 py-2">
              <p className="text-sm text-slate-700">
                {selectedIds.size} material{selectedIds.size === 1 ? "" : "s"} selected
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
                      if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < materials.length;
                    }}
                    checked={materials.length > 0 && selectedIds.size === materials.length}
                    onChange={toggleSelectAll}
                    aria-label="Select all materials on this page"
                  />
                </TableHead>
                <TableHead>Material Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Current Stock</TableHead>
                <TableHead>Stock Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Spinner /> Loading materials...
                    </span>
                  </TableCell>
                </TableRow>
              ) : materials.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                    No materials found. Click "Create Material" to add one.
                  </TableCell>
                </TableRow>
              ) : (
                materials.map((material) => (
                  <TableRow
                    key={material.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/materials/${material.id}`)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(material.id)}
                        onChange={() => toggleSelected(material.id)}
                        aria-label={`Select material ${material.materialCode}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium text-slate-900">
                      {material.materialCode}
                    </TableCell>
                    <TableCell>
                      <TruncatedText text={material.name} />
                    </TableCell>
                    <TableCell>{material.category?.name ?? "—"}</TableCell>
                    <TableCell>{material.unit?.symbol || material.unit?.name || "—"}</TableCell>
                    <TableCell>{formatCurrency(material.cost)}</TableCell>
                    <TableCell>{material.currentStock}</TableCell>
                    <TableCell>
                      <MaterialStockBadge material={material} />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="View details"
                          onClick={() => navigate(`/materials/${material.id}`)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Edit material"
                          onClick={() => navigate(`/materials/${material.id}/edit`)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Delete material"
                          onClick={() => openDeleteDialog(material)}
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
                ? "0 materials"
                : `Showing ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, total)} of ${total} materials`}
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

      <DeleteMaterialConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        material={selectedMaterial}
        onConfirm={handleDeleteConfirm}
      />
      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={`Delete ${selectedIds.size} material${selectedIds.size === 1 ? "" : "s"}?`}
        description="This will remove the selected materials from the catalog. The records themselves are not permanently erased."
        confirmLabel="Delete"
        confirmingLabel="Deleting..."
        onConfirm={handleBulkDeleteConfirm}
      />
      <ImportMaterialsDialog open={importOpen} onOpenChange={setImportOpen} onImported={fetchMaterials} />
    </div>
  );
}
