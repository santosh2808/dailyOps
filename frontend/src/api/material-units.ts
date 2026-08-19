import api from "@/lib/api";
import type { MaterialUnit } from "@/types";

export async function listMaterialUnits() {
  const res = await api.get<MaterialUnit[]>("/api/v1/material-units");
  return res.data;
}

export async function createMaterialUnit(payload: { name: string; symbol?: string }) {
  const res = await api.post<MaterialUnit>("/api/v1/material-units", payload);
  return res.data;
}
