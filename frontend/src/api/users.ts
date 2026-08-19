import api from "@/lib/api";
import type { PaginatedResponse, RbacUser } from "@/types";

export interface UserListParams {
  page?: number;
  limit?: number;
  search?: string;
}

// roleIds / departmentId here are also how the Role Assignment and
// Department Assignment screens work — both are just fields on this same
// payload, PATCHed to /api/v1/users/:id (see UsersController). Password is
// deliberately not part of this shared shape — general Edit never sets a
// password, that's resetUserPassword()'s job (its own dedicated endpoint).
export interface UserPayload {
  name: string;
  username: string;
  email: string;
  departmentId?: string;
  roleIds?: string[];
  isActive?: boolean;
}

export async function listUsers(params: UserListParams) {
  const res = await api.get<PaginatedResponse<RbacUser>>("/api/v1/users", { params });
  return res.data;
}

export async function getUser(id: string) {
  const res = await api.get<RbacUser>(`/api/v1/users/${id}`);
  return res.data;
}

// `password` is only ever provided on create — the backend's CreateUserDto
// requires it as the user's initial (temporary) password; every new user
// is forced to change it on first login (see UsersService.create()).
export async function createUser(payload: UserPayload & { password: string }) {
  const res = await api.post<RbacUser>("/api/v1/users", payload);
  return res.data;
}

export async function updateUser(id: string, payload: Partial<UserPayload>) {
  const res = await api.patch<RbacUser>(`/api/v1/users/${id}`, payload);
  return res.data;
}

export async function deleteUser(id: string) {
  const res = await api.delete<RbacUser>(`/api/v1/users/${id}`);
  return res.data;
}

// Administrator action ("Reset Passwords") — distinct from updateUser().
// Always forces the target user to change their password again on their
// next login (see UsersService.resetPassword()).
export async function resetUserPassword(id: string, newPassword: string) {
  const res = await api.post<RbacUser>(`/api/v1/users/${id}/reset-password`, { newPassword });
  return res.data;
}
