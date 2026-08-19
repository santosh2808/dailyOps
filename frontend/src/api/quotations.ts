import api from "@/lib/api";
import type { PaginatedResponse, Quotation, QuotationStatus } from "@/types";

export interface QuotationListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: QuotationStatus;
  customerId?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface QuotationItemPayload {
  productId: string;
  description?: string;
  quantity: number;
  unitPrice?: number;
}

export interface QuotationPayload {
  customerId: string;
  status?: QuotationStatus;
  items: QuotationItemPayload[];
  gstPercent?: number;
  validUntil?: string;
  notes?: string;
  terms?: string;
}

export async function listQuotations(params: QuotationListParams) {
  const res = await api.get<PaginatedResponse<Quotation>>("/api/v1/quotations", { params });
  return res.data;
}

export async function getQuotation(id: string) {
  const res = await api.get<Quotation>(`/api/v1/quotations/${id}`);
  return res.data;
}

export async function createQuotation(payload: QuotationPayload) {
  const res = await api.post<Quotation>("/api/v1/quotations", payload);
  return res.data;
}

export async function updateQuotation(id: string, payload: Partial<QuotationPayload>) {
  const res = await api.patch<Quotation>(`/api/v1/quotations/${id}`, payload);
  return res.data;
}

export async function updateQuotationStatus(id: string, status: QuotationStatus) {
  const res = await api.patch<Quotation>(`/api/v1/quotations/${id}/status`, { status });
  return res.data;
}

export async function deleteQuotation(id: string) {
  const res = await api.delete<Quotation>(`/api/v1/quotations/${id}`);
  return res.data;
}
