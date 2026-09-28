import api from "@/lib/api";

// Override Approval workflow — the unauthenticated counterpart to any
// internal API client, used only by PublicApproval.tsx (the
// /approvals/:token page reached from the "Approval Requested" email sent
// to Santosh Kumar Chegondi / Amarpal Gampa). Every call here hits
// PublicApprovalsController's no-guard routes; `api`'s request interceptor
// only attaches an Authorization header when a DailyOps session token
// actually exists in storage, so this is safe to reuse even for an approver
// who has never logged in (neither of them has an account at all).

export type OverrideApprovalType = "SALES_ORDER_DISPATCH" | "PROFORMA_INVOICE_ADVANCE" | "JEO_PRODUCTION_START";
export type OverrideApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "FAILED";

export interface PublicApprovalView {
  type: OverrideApprovalType;
  actionSummary: string;
  advanceReceived: number;
  requiredAdvance: number;
  requestedByName: string | null;
  requestedAt: string;
  status: OverrideApprovalStatus;
  tokenExpiresAt: string;
  decidedApprover: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  resultError: string | null;
}

export async function getPublicApproval(token: string) {
  const res = await api.get<PublicApprovalView>(`/api/v1/public/approvals/${token}`);
  return res.data;
}

export interface DecideApprovalPayload {
  approverName: string;
  note?: string;
}

export interface DecideApprovalResult {
  status: "APPROVED" | "REJECTED";
  actionSummary: string;
}

export async function approvePublicApproval(token: string, payload: DecideApprovalPayload) {
  const res = await api.post<DecideApprovalResult>(`/api/v1/public/approvals/${token}/approve`, payload);
  return res.data;
}

export async function rejectPublicApproval(token: string, payload: DecideApprovalPayload) {
  const res = await api.post<DecideApprovalResult>(`/api/v1/public/approvals/${token}/reject`, payload);
  return res.data;
}
