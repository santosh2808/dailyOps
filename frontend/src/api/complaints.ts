import api from "@/lib/api";
import type { Complaint, ComplaintStatus, EmailHistoryEntry, PaginatedResponse, TaxInvoiceItem } from "@/types";

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
  // Bug fix (TC-042/TC-048): optional, create-only (see ComplaintForm) —
  // when given, the backend auto-verifies it against TaxInvoice right at
  // creation instead of requiring a separate manual lookup/link step.
  invoiceNumber?: string;
  // Bug fix (TC-063): create-only — lets staff skip the acknowledgement
  // email the backend would otherwise send. Defaults to true when omitted.
  sendConfirmationEmail?: boolean;
}

export interface ComplaintStatusPayload {
  status: ComplaintStatus;
  resolutionNotes?: string;
}

export async function listComplaints(params: ComplaintListParams) {
  const res = await api.get<PaginatedResponse<Complaint>>("/api/v1/complaints", { params });
  return res.data;
}

// Additive (TC-061): mirrors exportMaterials() in api/materials.ts exactly —
// same blob-download shape, pointed at the complaints export endpoint and
// passing the current filters/sort as query params.
export async function exportComplaints(params: Omit<ComplaintListParams, "page" | "limit">) {
  const res = await api.get("/api/v1/complaints/export", { params, responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", "complaints-export.xlsx");
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
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

// Additive: Complaint <-> Lead conversion (Website Enquiries -> Lead/
// Complaint refactor). Requires both Complaint.Edit and Lead.Create.
export async function convertComplaintToLead(id: string, reason?: string) {
  const res = await api.post<{ id: string; leadNumber: string }>(`/api/v1/complaints/${id}/convert-to-lead`, {
    reason,
  });
  return res.data;
}

// Additive: warranty verification — invoice lookup/link. Never fabricates a
// match: an unknown invoice number resolves { found: false }.
export type InvoiceLookupResult =
  | { found: true; invoice: { id: string; invoiceNumber: string }; items: TaxInvoiceItem[] }
  | { found: false };

export async function lookupComplaintInvoice(id: string, invoiceNumber: string) {
  const res = await api.get<InvoiceLookupResult>(`/api/v1/complaints/${id}/invoice-lookup`, {
    params: { invoiceNumber },
  });
  return res.data;
}

// Additive (TC-062): standalone lookup for use during creation, before a
// complaint id exists yet — same InvoiceLookupResult shape as the id-scoped
// lookup above.
export async function lookupInvoiceStandalone(invoiceNumber: string) {
  const res = await api.get<InvoiceLookupResult>("/api/v1/complaints/invoice-lookup", {
    params: { invoiceNumber },
  });
  return res.data;
}

export async function linkComplaintInvoice(
  id: string,
  payload: { taxInvoiceId: string; taxInvoiceItemId?: string },
) {
  const res = await api.post<Complaint>(`/api/v1/complaints/${id}/link-invoice`, payload);
  return res.data;
}

// Additive: staff reply to whoever reported the complaint — reuses the same
// Mailer/EmailHistory pipeline every other module uses. The recipient is
// always resolved server-side (reporterEmail, or the linked Sales Order's
// customer email), never sent from the client.
export async function replyToComplaint(id: string, message: string) {
  const res = await api.post<{ status: "SENT" | "SIMULATED" | "FAILED"; errorMessage?: string }>(
    `/api/v1/complaints/${id}/reply`,
    { message },
  );
  return res.data;
}

export async function getComplaintEmailHistory(id: string) {
  const res = await api.get<EmailHistoryEntry[]>(`/api/v1/complaints/${id}/email-history`);
  return res.data;
}
