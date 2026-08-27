import api from "@/lib/api";
import type {
  EmailHistoryEntry,
  JeoDashboardResponse,
  JeoPriority,
  JeoStatus,
  JeoTimelineResponse,
  JobExecutionOrder,
  PaginatedResponse,
} from "@/types";

export interface JeoListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: JeoStatus;
  priority?: JeoPriority;
  customerId?: string;
  salesOrderId?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface JeoPayload {
  salesOrderId: string;
  priority?: JeoPriority;
  assignedTo?: string;
  remarks?: string;
}

export interface ProductionChecklistPayload {
  materialIssued?: boolean;
  assemblyStarted?: boolean;
  controllerInstalled?: boolean;
  wiringCompleted?: boolean;
  qcPassed?: boolean;
  packed?: boolean;
  readyForDispatch?: boolean;
}

export async function listJobExecutionOrders(params: JeoListParams) {
  const res = await api.get<PaginatedResponse<JobExecutionOrder>>("/api/v1/job-execution-orders", {
    params,
  });
  return res.data;
}

export async function getJobExecutionOrder(id: string) {
  const res = await api.get<JobExecutionOrder>(`/api/v1/job-execution-orders/${id}`);
  return res.data;
}

export async function createJobExecutionOrder(payload: JeoPayload) {
  const res = await api.post<JobExecutionOrder>("/api/v1/job-execution-orders", payload);
  return res.data;
}

export async function updateJeoStatus(id: string, status: JeoStatus) {
  const res = await api.patch<JobExecutionOrder>(`/api/v1/job-execution-orders/${id}/status`, {
    status,
  });
  return res.data;
}

export async function updateProductionChecklist(id: string, payload: ProductionChecklistPayload) {
  const res = await api.patch<JobExecutionOrder>(
    `/api/v1/job-execution-orders/${id}/checklist`,
    payload,
  );
  return res.data;
}

export async function getProductionDashboard() {
  const res = await api.get<JeoDashboardResponse>("/api/v1/job-execution-orders/production-dashboard");
  return res.data;
}

export async function getJeoTimeline(id: string) {
  const res = await api.get<JeoTimelineResponse>(`/api/v1/job-execution-orders/${id}/timeline`);
  return res.data;
}

export async function getJeoEmailHistory(id: string) {
  const res = await api.get<EmailHistoryEntry[]>(`/api/v1/job-execution-orders/${id}/email-history`);
  return res.data;
}

export async function openJeoPdf(id: string) {
  const res = await api.get(`/api/v1/job-execution-orders/${id}/pdf`, { responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
  window.open(url, "_blank");
  // Revoke after a delay rather than immediately — the new tab needs time
  // to actually load the blob URL before it's invalidated.
  setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
}
