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
  advanceReceived?: number;
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

export type UpdateProformaInvoicePayload = Partial<Omit<ProformaInvoicePayload, "salesOrderId" | "advanceReceived">>;

// Bug fix: edit a Proforma Invoice's printed details even after it's
// already been sent — pair with sendProformaInvoice() below (edit, then
// Resend) as the intended fix-a-mistake flow.
export async function updateProformaInvoice(id: string, payload: UpdateProformaInvoicePayload) {
  const res = await api.patch<ProformaInvoice>(`/api/v1/proforma-invoices/${id}`, payload);
  return res.data;
}

export async function updateProformaInvoiceStatus(id: string, status: ProformaInvoiceStatus) {
  const res = await api.patch<ProformaInvoice>(`/api/v1/proforma-invoices/${id}/status`, { status });
  return res.data;
}

export interface SendProformaInvoicePayload {
  recipientEmail?: string;
  ccEmails?: string;
}

export interface SendProformaInvoiceResult extends ProformaInvoice {
  emailStatus: "SENT" | "SIMULATED" | "FAILED";
}

// Bug fix: explicit, on-demand (re)send — previously the only send was an
// automatic, non-repeatable one at generation time. Mirrors
// sendTaxInvoice()'s review-then-send shape.
export async function sendProformaInvoice(id: string, payload: SendProformaInvoicePayload) {
  const res = await api.post<SendProformaInvoiceResult>(`/api/v1/proforma-invoices/${id}/send`, payload);
  return res.data;
}

// Record/update the actual advance amount received — the dispatch gate on
// the Sales Order and Tax Invoice generation both read this value.
export async function updateProformaInvoiceAdvance(id: string, advanceReceived: number) {
  const res = await api.patch<ProformaInvoice>(`/api/v1/proforma-invoices/${id}/advance`, { advanceReceived });
  return res.data;
}

export async function getProformaInvoiceEmailHistory(id: string) {
  const res = await api.get<EmailHistoryEntry[]>(`/api/v1/proforma-invoices/${id}/email-history`);
  return res.data;
}

export async function openProformaInvoicePdf(id: string) {
  const res = await api.get(`/api/v1/proforma-invoices/${id}/pdf`, { responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
  window.open(url, "_blank");
  // Revoke after a delay rather than immediately — the new tab needs time
  // to actually load the blob URL before it's invalidated.
  setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
}

// Additive: WhatsApp Share via Interakt — sends the invoice directly to the
// customer's WhatsApp using a pre-approved template (rather than returning
// a link for the browser to open a wa.me chat with). The backend generates
// (or reuses) the invoice's public token and embeds the no-login PDF link
// as a template variable.
export interface WhatsAppSendResult {
  status: "SENT" | "SIMULATED" | "FAILED";
  errorMessage?: string;
  phone?: string | null;
}

export async function sendProformaInvoiceWhatsApp(id: string) {
  const res = await api.post<WhatsAppSendResult>(`/api/v1/proforma-invoices/${id}/whatsapp-send`);
  return res.data;
}
