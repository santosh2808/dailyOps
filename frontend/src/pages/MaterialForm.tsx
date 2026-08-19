import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createMaterial,
  getMaterial,
  updateMaterial,
  type MaterialPayload,
} from "@/api/materials";
import {
  createMaterialCategory,
  listMaterialCategories,
} from "@/api/material-categories";
import { createMaterialUnit, listMaterialUnits } from "@/api/material-units";
import type { MaterialCategory, MaterialUnit } from "@/types";

interface FormState {
  materialCode: string;
  name: string;
  description: string;
  categoryId: string;
  unitId: string;
  supplierId: string;
  cost: string;
  minimumStock: string;
  maximumStock: string;
  reorderLevel: string;
  currentStock: string;
  warehouseId: string;
  isActive: boolean;
}

const emptyForm: FormState = {
  materialCode: "",
  name: "",
  description: "",
  categoryId: "",
  unitId: "",
  supplierId: "",
  cost: "",
  minimumStock: "0",
  maximumStock: "",
  reorderLevel: "0",
  currentStock: "0",
  warehouseId: "",
  isActive: true,
};

export default function MaterialForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [categories, setCategories] = useState<MaterialCategory[]>([]);
  const [units, setUnits] = useState<MaterialUnit[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [loading, setLoading] = useState(isEdit);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function loadLookups() {
    const [cats, us] = await Promise.all([listMaterialCategories(), listMaterialUnits()]);
    setCategories(cats);
    setUnits(us);
    return { cats, us };
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const { cats, us } = await loadLookups();
        if (cancelled) return;
        if (isEdit && id) {
          const material = await getMaterial(id);
          if (cancelled) return;
          setForm({
            materialCode: material.materialCode,
            name: material.name,
            description: material.description ?? "",
            categoryId: material.categoryId,
            unitId: material.unitId,
            supplierId: material.supplierId ?? "",
            cost: material.cost != null ? String(material.cost) : "",
            minimumStock: String(material.minimumStock),
            maximumStock: material.maximumStock != null ? String(material.maximumStock) : "",
            reorderLevel: String(material.reorderLevel),
            currentStock: String(material.currentStock),
            warehouseId: material.warehouseId ?? "",
            isActive: material.isActive,
          });
        } else {
          setForm((f) => ({
            ...f,
            categoryId: f.categoryId || cats[0]?.id || "",
            unitId: f.unitId || us[0]?.id || "",
          }));
        }
      } catch {
        setSubmitError("Could not load this material.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, id]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleAddCategory() {
    if (!newCategory.trim()) return;
    const created = await createMaterialCategory({ name: newCategory.trim() });
    setCategories((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    update("categoryId", created.id);
    setNewCategory("");
  }

  async function handleAddUnit() {
    if (!newUnit.trim()) return;
    const created = await createMaterialUnit({ name: newUnit.trim() });
    setUnits((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    update("unitId", created.id);
    setNewUnit("");
  }

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {};

    if (!form.materialCode.trim()) next.materialCode = "Material code is required";
    if (!form.name.trim()) next.name = "Material name is required";
    if (!form.categoryId) next.categoryId = "Category is required";
    if (!form.unitId) next.unitId = "Unit is required";

    if (form.cost.trim()) {
      const parsed = Number(form.cost);
      if (Number.isNaN(parsed) || parsed < 0) next.cost = "Cost cannot be negative";
    }
    if (form.minimumStock.trim()) {
      const parsed = Number(form.minimumStock);
      if (Number.isNaN(parsed) || parsed < 0) next.minimumStock = "Cannot be negative";
    }
    if (form.maximumStock.trim()) {
      const parsed = Number(form.maximumStock);
      if (Number.isNaN(parsed) || parsed < 0) next.maximumStock = "Cannot be negative";
    }
    if (form.reorderLevel.trim()) {
      const parsed = Number(form.reorderLevel);
      if (Number.isNaN(parsed) || parsed < 0) next.reorderLevel = "Cannot be negative";
    }
    if (!form.currentStock.trim()) {
      next.currentStock = "Current stock is required";
    } else {
      const parsed = Number(form.currentStock);
      if (Number.isNaN(parsed) || parsed < 0) {
        next.currentStock = "Current stock cannot be negative";
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError("");
    if (!validate()) return;

    const payload: MaterialPayload = {
      materialCode: form.materialCode.trim(),
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      categoryId: form.categoryId,
      unitId: form.unitId,
      supplierId: form.supplierId.trim() || undefined,
      cost: form.cost.trim() ? Number(form.cost) : undefined,
      minimumStock: form.minimumStock.trim() ? Number(form.minimumStock) : 0,
      maximumStock: form.maximumStock.trim() ? Number(form.maximumStock) : undefined,
      reorderLevel: form.reorderLevel.trim() ? Number(form.reorderLevel) : 0,
      currentStock: Number(form.currentStock),
      warehouseId: form.warehouseId.trim() || undefined,
      isActive: form.isActive,
    };

    setSubmitting(true);
    try {
      if (isEdit && id) {
        await updateMaterial(id, payload);
        navigate(`/materials/${id}`);
      } else {
        const created = await createMaterial(payload);
        navigate(`/materials/${created.id}`);
      }
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        "Something went wrong while saving this material. Please try again.";
      setSubmitError(Array.isArray(message) ? message.join(", ") : message);
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title={isEdit ? "Edit Material" : "Create Material"} />
        <main className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading material...</p>
          ) : (
            <form onSubmit={handleSubmit} className="mx-auto max-w-4xl space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Basic Information</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="materialCode">Material Code *</Label>
                    <Input
                      id="materialCode"
                      value={form.materialCode}
                      onChange={(e) => update("materialCode", e.target.value)}
                      placeholder="RM-STL-001"
                    />
                    {errors.materialCode && (
                      <p className="text-xs text-destructive">{errors.materialCode}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="name">Material Name *</Label>
                    <Input id="name" value={form.name} onChange={(e) => update("name", e.target.value)} />
                    {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={form.description}
                      onChange={(e) => update("description", e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="categoryId">Category *</Label>
                    <Select
                      id="categoryId"
                      value={form.categoryId}
                      onChange={(e) => update("categoryId", e.target.value)}
                    >
                      <option value="">Select category</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                    {errors.categoryId && (
                      <p className="text-xs text-destructive">{errors.categoryId}</p>
                    )}
                    <div className="flex gap-2">
                      <Input
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        placeholder="New category name"
                        className="h-8 text-xs"
                      />
                      <Button type="button" variant="outline" size="sm" onClick={handleAddCategory}>
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="unitId">Unit *</Label>
                    <Select id="unitId" value={form.unitId} onChange={(e) => update("unitId", e.target.value)}>
                      <option value="">Select unit</option>
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                          {u.symbol ? ` (${u.symbol})` : ""}
                        </option>
                      ))}
                    </Select>
                    {errors.unitId && <p className="text-xs text-destructive">{errors.unitId}</p>}
                    <div className="flex gap-2">
                      <Input
                        value={newUnit}
                        onChange={(e) => setNewUnit(e.target.value)}
                        placeholder="New unit name"
                        className="h-8 text-xs"
                      />
                      <Button type="button" variant="outline" size="sm" onClick={handleAddUnit}>
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Stock & Sourcing</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="cost">Cost</Label>
                    <Input
                      id="cost"
                      inputMode="decimal"
                      value={form.cost}
                      onChange={(e) => update("cost", e.target.value)}
                    />
                    {errors.cost && <p className="text-xs text-destructive">{errors.cost}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="currentStock">Current Stock *</Label>
                    <Input
                      id="currentStock"
                      inputMode="numeric"
                      value={form.currentStock}
                      onChange={(e) => update("currentStock", e.target.value)}
                    />
                    {errors.currentStock && (
                      <p className="text-xs text-destructive">{errors.currentStock}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reorderLevel">Reorder Level</Label>
                    <Input
                      id="reorderLevel"
                      inputMode="numeric"
                      value={form.reorderLevel}
                      onChange={(e) => update("reorderLevel", e.target.value)}
                    />
                    {errors.reorderLevel && (
                      <p className="text-xs text-destructive">{errors.reorderLevel}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="minimumStock">Minimum Stock</Label>
                    <Input
                      id="minimumStock"
                      inputMode="numeric"
                      value={form.minimumStock}
                      onChange={(e) => update("minimumStock", e.target.value)}
                    />
                    {errors.minimumStock && (
                      <p className="text-xs text-destructive">{errors.minimumStock}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="maximumStock">Maximum Stock</Label>
                    <Input
                      id="maximumStock"
                      inputMode="numeric"
                      value={form.maximumStock}
                      onChange={(e) => update("maximumStock", e.target.value)}
                    />
                    {errors.maximumStock && (
                      <p className="text-xs text-destructive">{errors.maximumStock}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="supplierId">Supplier</Label>
                    <Input
                      id="supplierId"
                      value={form.supplierId}
                      onChange={(e) => update("supplierId", e.target.value)}
                      placeholder="Supplier name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="warehouseId">Warehouse</Label>
                    <Input
                      id="warehouseId"
                      value={form.warehouseId}
                      onChange={(e) => update("warehouseId", e.target.value)}
                      placeholder="Warehouse / rack location"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-6">
                    <input
                      id="isActive"
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(e) => update("isActive", e.target.checked)}
                      className="h-4 w-4 rounded border-input"
                    />
                    <Label htmlFor="isActive">Active</Label>
                  </div>
                </CardContent>
              </Card>

              {submitError && <p className="text-sm text-destructive">{submitError}</p>}

              <div className="flex justify-end gap-2 pb-6">
                <Button type="button" variant="outline" onClick={() => navigate(-1)} disabled={submitting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Saving..." : isEdit ? "Save Changes" : "Create Material"}
                </Button>
              </div>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}
