import api from "@/lib/api";
import type { AuditLogEntry, PaginatedResponse } from "@/types";

export interface AuditLogListParams {
  page?: number;
  limit?: number;
  module?: string;
  action?: string;
  recordId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function listAuditLog(params: AuditLogListParams) {
  const res = await api.get<PaginatedResponse<AuditLogEntry>>("/api/v1/audit-log", { params });
  return res.data;
}
