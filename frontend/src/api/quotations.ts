import api from "@/lib/api";
import type {
  EmailHistoryEntry,
  PaginatedResponse,
  Quotation,
  QuotationApprovalRequest,
  QuotationCommercialTerms,
  QuotationStatus,
} from "@/types";

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
  // Lead Management Phase 1 (requirement #8): exactly one of
  // customerId/leadId is required — enforced by the backend, not the
  // frontend types, since "exactly one of" isn't expressible cleanly here
  // either. When leadId is given, items are derived server-side from the
  // Lead's own linked products, so items is omitted entirely by
  // generateQuotationFromLead() below.
  customerId?: string;
  leadId?: string;
  status?: QuotationStatus;
  items?: QuotationItemPayload[];
  gstPercent?: number;
  // Additive: real currency amounts feeding into grandTotal. Omit
  // installationCharge to let the backend auto-compute Rs.8,000 x total
  // quantity; omit transportationCharge to leave it at 0 (it has no
  // default — varies by site/distance).
  installationCharge?: number;
  transportationCharge?: number;
  validUntil?: string;
  notes?: string;
  terms?: string;
  // Additive: Techno-Commercial Offer PDF — Annexure-II commercial terms.
  commercialTerms?: QuotationCommercialTerms;
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

// Lead Management Phase 1 (requirement #8) — the one-click "Generate
// Quotation" action on a Qualified lead. No items/customer to pick: the
// backend derives everything from the Lead's own linked products.
export async function generateQuotationFromLead(leadId: string) {
  const res = await api.post<Quotation>("/api/v1/quotations", { leadId });
  return res.data;
}

export async function updateQuotation(id: string, payload: Partial<QuotationPayload>) {
  const res = await api.patch<Quotation>(`/api/v1/quotations/${id}`, payload);
  return res.data;
}

// The response is the updated Quotation plus an additive `salesOrder`
// field: when this status change is the transition into ACCEPTED, the
// backend automatically creates the Sales Order and returns it here so the
// caller can redirect straight to it (see QuotationDetails.tsx). For any
// other status change, `salesOrder` is null.
export interface UpdateQuotationStatusResult extends Quotation {
  salesOrder?: { id: string; salesOrderNumber: string } | null;
}

export async function updateQuotationStatus(id: string, status: QuotationStatus) {
  const res = await api.patch<UpdateQuotationStatusResult>(`/api/v1/quotations/${id}/status`, { status });
  return res.data;
}

export async function deleteQuotation(id: string) {
  const res = await api.delete<Quotation>(`/api/v1/quotations/${id}`);
  return res.data;
}

// Structured error body the backend returns from PATCH .../status when
// Price Validation / Approval Matrix blocks the ACCEPTED transition (see
// QuotationsService.assertCanAccept()). Present on the axios error's
// response.data when status 400 and code is one of these.
export interface QuotationApprovalErrorBody {
  code: "PRICE_BELOW_MINIMUM" | "APPROVAL_REQUIRED";
  message: string;
  items?: {
    productId: string;
    productName: string;
    enteredPrice: number;
    minimumPrice: number;
    difference: number;
  }[];
  discountPercent?: number;
  requiredRole?: string;
}

export interface SendQuotationPayload {
  recipientEmail?: string;
  ccEmails?: string;
}

export interface SendQuotationResult extends Quotation {
  emailStatus: "SENT" | "SIMULATED" | "FAILED";
}

export async function sendQuotation(id: string, payload: SendQuotationPayload) {
  const res = await api.post<SendQuotationResult>(`/api/v1/quotations/${id}/send`, payload);
  return res.data;
}

export async function getQuotationEmailHistory(id: string) {
  const res = await api.get<EmailHistoryEntry[]>(`/api/v1/quotations/${id}/email-history`);
  return res.data;
}

// The PDF route is behind JwtAuthGuard, so it can't be linked to directly
// with a plain <a href> (no Authorization header would be sent). Fetch it
// through the authenticated axios client instead and open the resulting
// blob in a new tab — same pattern as downloadSupplierImportTemplate(),
// but viewing inline rather than triggering a download.
export async function openQuotationPdf(id: string) {
  const res = await api.get(`/api/v1/quotations/${id}/pdf`, { responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
  window.open(url, "_blank");
  // Revoke after a delay rather than immediately — the new tab needs time
  // to actually load the blob URL before it's invalidated.
  setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
}

export async function requestQuotationApproval(id: string, reason?: string) {
  const res = await api.post<QuotationApprovalRequest>(`/api/v1/quotations/${id}/request-approval`, { reason });
  return res.data;
}

export async function listQuotationApprovalRequests(status?: string) {
  const res = await api.get<QuotationApprovalRequest[]>("/api/v1/quotations/approval-requests", {
    params: status ? { status } : undefined,
  });
  return res.data;
}

export async function decideQuotationApproval(requestId: string, approve: boolean, remarks?: string) {
  const res = await api.patch<UpdateQuotationStatusResult & { status: string }>(
    `/api/v1/quotations/approval-requests/${requestId}/decide`,
    { approve, remarks },
  );
  return res.data;
}
