import api from "@/lib/api";
import type { EmailHistoryEntry, PaginatedResponse, SalesOrder, SalesOrderStatus } from "@/types";

export interface SalesOrderListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: SalesOrderStatus;
  customerId?: string;
  quotationId?: string;
  customerState?: string;
  createdBy?: string;
  productId?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface SalesOrderItemPayload {
  productId: string;
  quantity: number;
  unitPrice?: number;
  discount?: number;
  description?: string;
}

export interface SalesOrderPayload {
  quotationId: string;
  items: SalesOrderItemPayload[];
  orderDate?: string;
  deliveryDate?: string;
  paymentTerms?: string;
  gstPercent?: number;
  billingAddress?: string;
  shippingAddress?: string;
  // The customer's own Purchase Order number — required by the backend DTO
  // for manual create/update unless noPoAvailable is true. See
  // CreateSalesOrderDto.customerPoNumber/noPoAvailable/noPoReason.
  customerPoNumber?: string;
  noPoAvailable?: boolean;
  noPoReason?: string;
  specialInstructions?: string;
  remarks?: string;
}

export async function listSalesOrders(params: SalesOrderListParams) {
  const res = await api.get<PaginatedResponse<SalesOrder>>("/api/v1/sales-orders", { params });
  return res.data;
}

export async function getSalesOrder(id: string) {
  const res = await api.get<SalesOrder>(`/api/v1/sales-orders/${id}`);
  return res.data;
}

export async function createSalesOrder(payload: SalesOrderPayload) {
  const res = await api.post<SalesOrder>("/api/v1/sales-orders", payload);
  return res.data;
}

export async function updateSalesOrder(id: string, payload: Partial<Omit<SalesOrderPayload, "quotationId">>) {
  const res = await api.patch<SalesOrder>(`/api/v1/sales-orders/${id}`, payload);
  return res.data;
}

export async function updateSalesOrderStatus(
  id: string,
  status: SalesOrderStatus,
  dispatchOverrideNote?: string,
  dispatchOverrideApprovedBy?: string,
) {
  const res = await api.patch<SalesOrder>(`/api/v1/sales-orders/${id}/status`, {
    status,
    dispatchOverrideNote,
    dispatchOverrideApprovedBy,
  });
  return res.data;
}

export async function deleteSalesOrder(id: string) {
  const res = await api.delete<SalesOrder>(`/api/v1/sales-orders/${id}`);
  return res.data;
}

export async function getSalesOrderEmailHistory(id: string) {
  const res = await api.get<EmailHistoryEntry[]>(`/api/v1/sales-orders/${id}/email-history`);
  return res.data;
}

export interface SendSalesOrderPayload {
  recipientEmail?: string;
  ccEmails?: string;
}

export interface SendSalesOrderResult extends SalesOrder {
  emailStatus: "SENT" | "SIMULATED" | "FAILED";
}

// QA bug fix (SC-007): editing a Sales Order never notified the customer —
// this is the explicit send/resend action staff use after saving changes.
// Mirrors sendProformaInvoice()/sendTaxInvoice() — see
// SalesOrdersService.sendSalesOrder() for the backend side.
export async function sendSalesOrder(id: string, payload: SendSalesOrderPayload) {
  const res = await api.post<SendSalesOrderResult>(`/api/v1/sales-orders/${id}/send`, payload);
  return res.data;
}

// Customer's Purchase Order document — a scan/photo of the actual PO,
// separate from customerPoNumber (the required text field above). Same
// upload/blob-fetch/delete pattern as Lead Site Visit Photos
// (uploadSiteVisitPhotos/getSiteVisitPhotoBlobUrl/deleteSiteVisitPhoto in
// api/leads.ts), except this is a single file per Sales Order rather than a
// gallery.
export async function uploadSalesOrderPoDocument(id: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await api.post<SalesOrder>(`/api/v1/sales-orders/${id}/po-document`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

// See getSiteVisitPhotoBlobUrl()'s comment in api/leads.ts — same reasoning
// (the streaming endpoint needs the Authorization header a plain <a href>
// can't send). Caller owns the returned URL and must revokeObjectURL() it.
export async function getSalesOrderPoDocumentBlobUrl(id: string) {
  const res = await api.get(`/api/v1/sales-orders/${id}/po-document/file`, {
    responseType: "blob",
  });
  return URL.createObjectURL(res.data as Blob);
}

export async function deleteSalesOrderPoDocument(id: string) {
  const res = await api.delete<SalesOrder>(`/api/v1/sales-orders/${id}/po-document`);
  return res.data;
}
