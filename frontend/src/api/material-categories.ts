import api from "@/lib/api";
import type { MaterialCategory } from "@/types";

export async function listMaterialCategories() {
  const res = await api.get<MaterialCategory[]>("/api/v1/material-categories");
  return res.data;
}

export async function createMaterialCategory(payload: { name: string; description?: string }) {
  const res = await api.post<MaterialCategory>("/api/v1/material-categories", payload);
  return res.data;
}
