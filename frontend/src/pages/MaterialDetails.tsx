import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, RefreshCw, Trash2 } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import MaterialStockBadge from "@/components/materials/MaterialStockBadge";
import DeleteMaterialConfirmDialog from "@/components/materials/DeleteMaterialConfirmDialog";
import { deactivateMaterial, getMaterial } from "@/api/materials";
import type { Material } from "@/types";

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm text-slate-900">{value || "—"}</p>
    </div>
  );
}

function formatCurrency(value?: number | null) {
  if (value == null) return null;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString();
}

export default function MaterialDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [material, setMaterial] = useState<Material | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const fetchMaterial = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const data = await getMaterial(id);
      setMaterial(data);
    } catch {
      setError("Could not load this material.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchMaterial();
  }, [fetchMaterial]);

  async function handleDeleteConfirm() {
    if (!id) return;
    await deactivateMaterial(id);
    navigate("/materials");
  }

  return (
    <div className="flex h-screen bg-app-grid">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="Material Details" />
        <main className="flex-1 overflow-y-auto p-6">
          <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate("/materials")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Materials
          </Button>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading material...</p>
          ) : error || !material ? (
            <div className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <span>{error || "Material not found."}</span>
              <Button variant="outline" size="sm" onClick={fetchMaterial}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          ) : (
            <div className="mx-auto max-w-4xl space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">{material.materialCode}</h2>
                  <p className="text-sm text-muted-foreground">{material.name}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => navigate(`/materials/${material.id}/edit`)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                  <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Stock</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Field label="Stock Status" value={<MaterialStockBadge material={material} />} />
                  <Field label="Current Stock" value={material.currentStock} />
                  <Field label="Reorder Level" value={material.reorderLevel} />
                  <Field label="Minimum Stock" value={material.minimumStock} />
                  <Field label="Maximum Stock" value={material.maximumStock} />
                  <Field label="Cost" value={formatCurrency(material.cost)} />
                  <Field label="Warehouse" value={material.warehouseId} />
                  <Field label="Supplier" value={material.supplierId} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Basic Information</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <Field label="Category" value={material.category?.name} />
                  <Field
                    label="Unit"
                    value={
                      material.unit
                        ? `${material.unit.name}${material.unit.symbol ? ` (${material.unit.symbol})` : ""}`
                        : null
                    }
                  />
                  <Field label="Active" value={material.isActive ? "Yes" : "No"} />
                  <Field label="Created" value={formatDate(material.createdAt)} />
                  <Field label="Last Updated" value={formatDate(material.updatedAt)} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <Field label="Description" value={material.description} />
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </div>

      <DeleteMaterialConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        material={material}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
