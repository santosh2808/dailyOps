import api from "@/lib/api";
import type { ApprovalMatrixEntry } from "@/types";

export interface ApprovalMatrixPayload {
  module: string;
  minPercent: number;
  maxPercent: number;
  requiredRoleId: string;
  isActive?: boolean;
}

export async function listApprovalMatrix(module?: string) {
  const res = await api.get<ApprovalMatrixEntry[]>("/api/v1/approval-matrix", {
    params: module ? { module } : undefined,
  });
  return res.data;
}

export async function createApprovalMatrixEntry(payload: ApprovalMatrixPayload) {
  const res = await api.post<ApprovalMatrixEntry>("/api/v1/approval-matrix", payload);
  return res.data;
}

export async function updateApprovalMatrixEntry(id: string, payload: Partial<ApprovalMatrixPayload>) {
  const res = await api.patch<ApprovalMatrixEntry>(`/api/v1/approval-matrix/${id}`, payload);
  return res.data;
}

export async function deleteApprovalMatrixEntry(id: string) {
  const res = await api.delete<ApprovalMatrixEntry>(`/api/v1/approval-matrix/${id}`);
  return res.data;
}
