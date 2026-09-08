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

// Lead Assignment "+ Add User" modal (QuickAddUserDialog) — a minimal
// id/name lookup gated by User:Create rather than Department:View, so
// whoever can quick-create a user (Sales Manager) doesn't also need the
// full Administration -> Departments permission just to populate this
// dropdown. See DepartmentsController#findBasic.
export async function listDepartmentsBasic() {
  const res = await api.get<Pick<Department, "id" | "name">[]>("/api/v1/departments/basic");
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
