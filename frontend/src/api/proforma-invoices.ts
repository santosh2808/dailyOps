import api from "@/lib/api";
import type {
  EmailHistoryEntry,
  PaginatedResponse,
  ProformaInvoice,
  ProformaInvoiceStatus,
} from "@/types";

export interface ProformaInvoiceListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: ProformaInvoiceStatus;
  customerId?: string;
  salesOrderId?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface ProformaInvoicePayload {
  salesOrderId: string;
  invoiceDate?: string;
  validUntil?: string;
  paymentTerms?: string;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  branch?: string;
  notes?: string;
}

export async function listProformaInvoices(params: ProformaInvoiceListParams) {
  const res = await api.get<PaginatedResponse<ProformaInvoice>>("/api/v1/proforma-invoices", {
    params,
  });
  return res.data;
}

export async function getProformaInvoice(id: string) {
  const res = await api.get<ProformaInvoice>(`/api/v1/proforma-invoices/${id}`);
  return res.data;
}

export async function createProformaInvoice(payload: ProformaInvoicePayload) {
  const res = await api.post<ProformaInvoice>("/api/v1/proforma-invoices", payload);
  return res.data;
}

export async function updateProformaInvoiceStatus(id: string, status: ProformaInvoiceStatus) {
  const res = await api.patch<ProformaInvoice>(`/api/v1/proforma-invoices/${id}/status`, { status });
  return res.data;
}

export async function getProformaInvoiceEmailHistory(id: string) {
  const res = await api.get<EmailHistoryEntry[]>(`/api/v1/proforma-invoices/${id}/email-history`);
  return res.data;
}
