import api from "@/lib/api";
import type {
  AiLeadStatus,
  AiQualification,
  Customer,
  EmailHistoryEntry,
  LanguageSource,
  Lead,
  LeadAiCallLog,
  LeadAssignmentHistory,
  LeadHistoryEntry,
  LeadImportSummary,
  LeadNote,
  LeadPriority,
  LeadSource,
  LeadStatus,
  LeadStatusHistoryEntry,
  JeoTimelineResponse,
  PaginatedResponse,
  PreferredLanguage,
} from "@/types";

export interface LeadListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: LeadStatus;
  priority?: LeadPriority;
  source?: LeadSource;
  assignedToUserId?: string;
  state?: string;
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
  // Bug fix: see LeadProduct's color/colorCharge comment in types/index.ts —
  // without this, "Generate Quotation" from a lead with a fan product had
  // no way to ever supply the color that fan item's Quotation row requires.
  color?: string;
  colorCharge?: number;
}

export interface LeadPayload {
  // No longer required — see CreateLeadDto.companyName.
  companyName?: string;
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
  // D.O.T. AI Lead Assistant Phase 1: an explicit choice here always wins
  // over the state-based default the backend would otherwise compute.
  preferredLanguage?: PreferredLanguage;
  // Lead re-engagement: only meaningful on create — the backend silently
  // discards this field on update (see LeadsService.update()), so there's
  // no point sending it there.
  previousLeadId?: string;
}

// D.O.T. AI Lead Assistant Phase 1 — AI-specific fields, updated only
// through updateLeadAi() below, never through updateLead() above.
export interface LeadAiPayload {
  aiStatus?: AiLeadStatus;
  aiQualification?: AiQualification;
  aiSummary?: string;
  preferredLanguage?: PreferredLanguage;
  languageSource?: LanguageSource;
  aiCallAttempts?: number;
  lastAiCallAt?: string;
  nextAiCallAt?: string;
  aiSiteVisitRequested?: boolean;
  aiCallbackRequested?: boolean;
  aiCallbackAt?: string;
}

// D.O.T. AI Lead Assistant Phase 1 — records one D.O.T. call attempt. Only
// ever called manually in Phase 1 (no telephony provider); see
// backend CreateLeadAiCallLogDto for the full field-by-field rationale.
export interface LeadAiCallLogPayload {
  status: AiLeadStatus;
  externalCallId?: string;
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  language?: PreferredLanguage;
  qualification?: AiQualification;
  summary?: string;
  transcriptRef?: string;
  recordingRef?: string;
  siteVisitRequested?: boolean;
  callbackRequested?: boolean;
  callbackAt?: string;
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

// Quick-glance Lead-stage tracker (New -> ... -> Quotation Sent ->
// Won/Lost) — same response shape as the JEO Details Timeline
// (GET /job-execution-orders/:id/timeline), so it's typed with the same
// JeoTimelineResponse rather than duplicating an identical interface.
export async function getLeadPipelineTimeline(id: string) {
  const res = await api.get<JeoTimelineResponse>(`/api/v1/leads/${id}/pipeline-timeline`);
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

// D.O.T. AI Lead Assistant Phase 1 — "D.O.T. AI Follow-up" section + Call
// History list on Lead Details.
export async function getLeadAiCallHistory(id: string) {
  const res = await api.get<LeadAiCallLog[]>(`/api/v1/leads/${id}/ai-call-history`);
  return res.data;
}

export async function updateLeadAi(id: string, payload: LeadAiPayload) {
  const res = await api.patch<Lead>(`/api/v1/leads/${id}/ai`, payload);
  return res.data;
}

// Manual/dev-test call logging in Phase 1 — no telephony provider calls
// this; see LeadAiCallLogPayload.
export async function addLeadAiCallLog(id: string, payload: LeadAiCallLogPayload) {
  const res = await api.post<Lead>(`/api/v1/leads/${id}/ai-call-history`, payload);
  return res.data;
}
