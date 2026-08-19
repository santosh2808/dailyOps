import api from "@/lib/api";
import type { Role } from "@/types";

export interface RolePayload {
  name: string;
  description?: string;
  permissionIds?: string[];
}

export async function listRoles() {
  const res = await api.get<Role[]>("/api/v1/roles");
  return res.data;
}

export async function getRole(id: string) {
  const res = await api.get<Role>(`/api/v1/roles/${id}`);
  return res.data;
}

export async function createRole(payload: RolePayload) {
  const res = await api.post<Role>("/api/v1/roles", payload);
  return res.data;
}

// Also how permissions are assigned to a role — PATCH with a full
// permissionIds array replaces the role's existing permission set.
export async function updateRole(id: string, payload: Partial<RolePayload>) {
  const res = await api.patch<Role>(`/api/v1/roles/${id}`, payload);
  return res.data;
}

export async function deleteRole(id: string) {
  const res = await api.delete<Role>(`/api/v1/roles/${id}`);
  return res.data;
}
