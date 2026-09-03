import api from "@/lib/api";
import type {
  Customer,
  EmailHistoryEntry,
  Lead,
  LeadAssignmentHistory,
  LeadHistoryEntry,
  LeadImportSummary,
  LeadNote,
  LeadPriority,
  LeadSource,
  LeadStatus,
  LeadStatusHistoryEntry,
  PaginatedResponse,
} from "@/types";

export interface LeadListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: LeadStatus;
  priority?: LeadPriority;
  source?: LeadSource;
  assignedToUserId?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface LeadProductPayload {
  productId: string;
  quantity: number;
  unitPrice?: number;
  remarks?: string;
}

export interface LeadPayload {
  companyName: string;
  contactPerson: string;
  designation?: string;
  email?: string;
  phone: string;
  alternatePhone?: string;
  city?: string;
  state?: string;
  country?: string;
  industry?: string;
  title: string;
  description?: string;
  products?: LeadProductPayload[];
  estimatedValue?: number;
  priority?: LeadPriority;
  source?: LeadSource;
  expectedCloseDate?: string;
  nextFollowUp?: string;
  // Lead Management Phase 1 (requirement #5) — short free-text reminder
  // alongside the follow-up date, e.g. "Call before 3pm".
  reminderNote?: string;
  remarks?: string;
  // Lead Assignment enhancement: send null to explicitly unassign; omit to
  // leave the current assignment untouched on a PATCH.
  assignedToUserId?: string | null;
}

export async function listLeads(params: LeadListParams) {
  const res = await api.get<PaginatedResponse<Lead>>("/api/v1/leads", { params });
  return res.data;
}

export async function getLead(id: string) {
  const res = await api.get<Lead>(`/api/v1/leads/${id}`);
  return res.data;
}

export async function createLead(payload: LeadPayload) {
  const res = await api.post<Lead>("/api/v1/leads", payload);
  return res.data;
}

export async function updateLead(id: string, payload: Partial<LeadPayload>) {
  const res = await api.patch<Lead>(`/api/v1/leads/${id}`, payload);
  return res.data;
}

export async function updateLeadStatus(id: string, status: LeadStatus, remarks?: string) {
  const res = await api.patch<Lead>(`/api/v1/leads/${id}/status`, { status, remarks });
  return res.data;
}

export async function getLeadHistory(id: string) {
  const res = await api.get<LeadHistoryEntry[]>(`/api/v1/leads/${id}/history`);
  return res.data;
}

export async function getLeadNotes(id: string) {
  const res = await api.get<LeadNote[]>(`/api/v1/leads/${id}/notes`);
  return res.data;
}

export async function addLeadNote(id: string, note: string) {
  const res = await api.post<LeadNote>(`/api/v1/leads/${id}/notes`, { note });
  return res.data;
}

// Sales Automation requirement #16 — dedicated Assignment/Status/Email
// History tabs on Lead Details, distinct from the merged Timeline above.
export async function getLeadAssignmentHistory(id: string) {
  const res = await api.get<LeadAssignmentHistory[]>(`/api/v1/leads/${id}/assignment-history`);
  return res.data;
}

export async function getLeadStatusHistory(id: string) {
  const res = await api.get<LeadStatusHistoryEntry[]>(`/api/v1/leads/${id}/status-history`);
  return res.data;
}

export async function getLeadEmailHistory(id: string) {
  const res = await api.get<EmailHistoryEntry[]>(`/api/v1/leads/${id}/email-history`);
  return res.data;
}

export async function deleteLead(id: string) {
  const res = await api.delete<Lead>(`/api/v1/leads/${id}`);
  return res.data;
}

export async function convertLeadToCustomer(id: string) {
  const res = await api.post<{ lead: Lead; customer: Customer }>(`/api/v1/leads/${id}/convert`);
  return res.data;
}

// Additive: Lead <-> Complaint conversion (Website Enquiries -> Lead/
// Complaint refactor). Requires both Lead.Edit and Complaint.Create.
export async function convertLeadToComplaint(id: string, reason?: string) {
  const res = await api.post<{ id: string; complaintNumber: string }>(`/api/v1/leads/${id}/convert-to-complaint`, {
    reason,
  });
  return res.data;
}

export async function downloadLeadImportTemplate() {
  const res = await api.get("/api/v1/leads/import/template", { responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", "lead-import-template.xlsx");
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function previewLeadImport(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await api.post<LeadImportSummary>("/api/v1/leads/import/preview", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

// Sends back the rows the Preview step returned as 'valid' (the caller
// filters those out before calling this) so the file doesn't need to be
// re-uploaded/re-parsed. The backend re-validates and re-checks duplicates
// on every row anyway, rather than trusting this filtering blindly.
export async function importLeads(rows: LeadImportSummary["rows"]) {
  const res = await api.post<LeadImportSummary>("/api/v1/leads/import", { rows });
  return res.data;
}
