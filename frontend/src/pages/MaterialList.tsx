import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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

export default function MaterialList() {
  const navigate = useNavigate();

  const [materials, setMaterials] = useState<Material[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listMaterials({
        page,
        limit: PAGE_SIZE,
        search: debouncedSearch || undefined,
      });
      setMaterials(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch {
      setError("Failed to load materials.");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

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

  function openDeleteDialog(material: Material) {
    setSelectedMaterial(material);
    setDeleteOpen(true);
  }

  async function handleDeleteConfirm() {
    if (!selectedMaterial) return;
    await deactivateMaterial(selectedMaterial.id);
    await fetchMaterials();
  }

  async function handleExport() {
    setExporting(true);
    try {
      await exportMaterials();
    } catch {
      setError("Failed to export materials.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex h-screen bg-app-grid">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="Materials" />
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
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Import Excel
              </Button>
              <Button variant="outline" onClick={handleExport} disabled={exporting}>
                <Download className="mr-2 h-4 w-4" />
                {exporting ? "Exporting..." : "Export Excel"}
              </Button>
              <Button onClick={() => navigate("/materials/new")}>
                <Plus className="mr-2 h-4 w-4" />
                Create Material
              </Button>
            </div>
          </div>

          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

          <Table>
            <TableHeader>
              <TableRow>
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
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    Loading materials...
                  </TableCell>
                </TableRow>
              ) : materials.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
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
                    <TableCell className="font-medium text-slate-900">
                      {material.materialCode}
                    </TableCell>
                    <TableCell>{material.name}</TableCell>
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
      <ImportMaterialsDialog open={importOpen} onOpenChange={setImportOpen} onImported={fetchMaterials} />
    </div>
  );
}
