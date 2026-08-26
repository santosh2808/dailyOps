import api from "@/lib/api";
import type { Complaint, ComplaintStatus, PaginatedResponse } from "@/types";

export interface ComplaintListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: ComplaintStatus;
  salesOrderId?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

// complaintNumber is deliberately absent — it is always auto-generated
// server-side (ComplaintsService.generateComplaintNumber()), same
// convention as Supplier.supplierCode / Lead.leadNumber.
export interface ComplaintPayload {
  salesOrderId: string;
  subject: string;
  description?: string;
}

export interface ComplaintStatusPayload {
  status: ComplaintStatus;
  resolutionNotes?: string;
}

export async function listComplaints(params: ComplaintListParams) {
  const res = await api.get<PaginatedResponse<Complaint>>("/api/v1/complaints", { params });
  return res.data;
}

export async function getComplaint(id: string) {
  const res = await api.get<Complaint>(`/api/v1/complaints/${id}`);
  return res.data;
}

export async function createComplaint(payload: ComplaintPayload) {
  const res = await api.post<Complaint>("/api/v1/complaints", payload);
  return res.data;
}

export async function updateComplaint(id: string, payload: Partial<Omit<ComplaintPayload, "salesOrderId">>) {
  const res = await api.patch<Complaint>(`/api/v1/complaints/${id}`, payload);
  return res.data;
}

export async function updateComplaintStatus(id: string, payload: ComplaintStatusPayload) {
  const res = await api.patch<Complaint>(`/api/v1/complaints/${id}/status`, payload);
  return res.data;
}

export async function deleteComplaint(id: string) {
  const res = await api.delete<Complaint>(`/api/v1/complaints/${id}`);
  return res.data;
}
