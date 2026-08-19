import api from "@/lib/api";
import type {
  Customer,
  Lead,
  LeadImportSummary,
  LeadPriority,
  LeadSource,
  LeadStatus,
  PaginatedResponse,
} from "@/types";

export interface LeadListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: LeadStatus;
  priority?: LeadPriority;
  source?: LeadSource;
  assignedTo?: string;
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
  remarks?: string;
  assignedTo?: string;
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

export async function updateLeadStatus(id: string, status: LeadStatus) {
  const res = await api.patch<Lead>(`/api/v1/leads/${id}/status`, { status });
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
