import api from "@/lib/api";
import type { Material, MaterialImportResult, PaginatedResponse } from "@/types";

export interface MaterialListParams {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  unitId?: string;
  stockStatus?: "low_stock" | "out_of_stock";
}

export interface MaterialPayload {
  materialCode: string;
  name: string;
  description?: string;
  categoryId: string;
  unitId: string;
  supplierId?: string;
  cost?: number;
  minimumStock?: number;
  maximumStock?: number;
  reorderLevel?: number;
  currentStock?: number;
  warehouseId?: string;
  isActive?: boolean;
}

export async function listMaterials(params: MaterialListParams) {
  const res = await api.get<PaginatedResponse<Material>>("/api/v1/materials", {
    params,
  });
  return res.data;
}

export async function getMaterial(id: string) {
  const res = await api.get<Material>(`/api/v1/materials/${id}`);
  return res.data;
}

export async function createMaterial(payload: MaterialPayload) {
  const res = await api.post<Material>("/api/v1/materials", payload);
  return res.data;
}

export async function updateMaterial(id: string, payload: Partial<MaterialPayload>) {
  const res = await api.patch<Material>(`/api/v1/materials/${id}`, payload);
  return res.data;
}

export async function deactivateMaterial(id: string) {
  const res = await api.delete<Material>(`/api/v1/materials/${id}`);
  return res.data;
}

export async function exportMaterials() {
  const res = await api.get("/api/v1/materials/export", { responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", "materials-export.xlsx");
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function importMaterials(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await api.post<MaterialImportResult>("/api/v1/materials/import", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}
