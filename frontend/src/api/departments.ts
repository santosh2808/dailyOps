import api from "@/lib/api";
import type { Department } from "@/types";

export interface DepartmentPayload {
  name: string;
  description?: string;
}

export async function listDepartments() {
  const res = await api.get<Department[]>("/api/v1/departments");
  return res.data;
}

export async function getDepartment(id: string) {
  const res = await api.get<Department>(`/api/v1/departments/${id}`);
  return res.data;
}

export async function createDepartment(payload: DepartmentPayload) {
  const res = await api.post<Department>("/api/v1/departments", payload);
  return res.data;
}

export async function updateDepartment(id: string, payload: Partial<DepartmentPayload>) {
  const res = await api.patch<Department>(`/api/v1/departments/${id}`, payload);
  return res.data;
}

export async function deleteDepartment(id: string) {
  const res = await api.delete<Department>(`/api/v1/departments/${id}`);
  return res.data;
}
