import api from "@/lib/api";

// Customer Quotation Acceptance workflow — the unauthenticated counterpart
// to api/quotations.ts, used only by PublicQuotation.tsx (the /quote/:token
// page). Every call here hits PublicQuotationsController's no-guard routes;
// `api`'s request interceptor only attaches an Authorization header when a
// DailyOps session token actually exists in storage, so this is safe to
// reuse even for a visitor who has never logged in.

export interface PublicQuotationItem {
  productName: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface PublicQuotationView {
  quotationNumber: string;
  quotationDate: string;
  validUntil?: string | null;
  customerName: string;
  customerCompany: string;
  items: PublicQuotationItem[];
  subtotal: number;
  gstPercent: number;
  gstAmount: number;
  installationCharge: number;
  transportationCharge: number;
  grandTotal: number;
  paymentTerms?: string | null;
  deliveryTerms?: string | null;
  notes?: string | null;
  terms?: string | null;
  status: string;
  acceptedAt?: string | null;
  acceptedByName?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
}

export type PublicQuotationResult =
  | { expired: true; quotationNumber: string }
  | { expired: false; quotation: PublicQuotationView };

export async function getPublicQuotation(token: string) {
  const res = await api.get<PublicQuotationResult>(`/api/v1/public/quotations/${token}`);
  return res.data;
}

export async function openPublicQuotationPdf(token: string) {
  const res = await api.get(`/api/v1/public/quotations/${token}/pdf`, { responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
  window.open(url, "_blank");
  setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
}

export interface AcceptPublicQuotationPayload {
  name: string;
  designation?: string;
  comment?: string;
  confirm: true;
}

export async function acceptPublicQuotation(token: string, payload: AcceptPublicQuotationPayload) {
  const res = await api.post<{ quotationNumber: string; companyName: string }>(
    `/api/v1/public/quotations/${token}/accept`,
    payload,
  );
  return res.data;
}

export interface RejectPublicQuotationPayload {
  reason: string;
  comment?: string;
}

export async function rejectPublicQuotation(token: string, payload: RejectPublicQuotationPayload) {
  const res = await api.post<{ quotationNumber: string; companyName: string }>(
    `/api/v1/public/quotations/${token}/reject`,
    payload,
  );
  return res.data;
}
