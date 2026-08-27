import api from "@/lib/api";
import type {
  EmailHistoryEntry,
  PaginatedResponse,
  TaxInvoice,
  TaxInvoiceStatus,
} from "@/types";

export interface TaxInvoiceListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: TaxInvoiceStatus;
  customerId?: string;
  salesOrderId?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface TaxInvoicePayload {
  salesOrderId: string;
  invoiceDate?: string;
  buyersOrderNo?: string;
  dispatchedThrough?: string;
  destination?: string;
  termsOfDelivery?: string;
}

export async function listTaxInvoices(params: TaxInvoiceListParams) {
  const res = await api.get<PaginatedResponse<TaxInvoice>>("/api/v1/tax-invoices", { params });
  return res.data;
}

export async function getTaxInvoice(id: string) {
  const res = await api.get<TaxInvoice>(`/api/v1/tax-invoices/${id}`);
  return res.data;
}

export async function createTaxInvoice(payload: TaxInvoicePayload) {
  const res = await api.post<TaxInvoice>("/api/v1/tax-invoices", payload);
  return res.data;
}

export async function updateTaxInvoiceStatus(id: string, status: TaxInvoiceStatus) {
  const res = await api.patch<TaxInvoice>(`/api/v1/tax-invoices/${id}/status`, { status });
  return res.data;
}

export async function getTaxInvoiceEmailHistory(id: string) {
  const res = await api.get<EmailHistoryEntry[]>(`/api/v1/tax-invoices/${id}/email-history`);
  return res.data;
}

export async function openTaxInvoicePdf(id: string) {
  const res = await api.get(`/api/v1/tax-invoices/${id}/pdf`, { responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
  window.open(url, "_blank");
  setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
}
