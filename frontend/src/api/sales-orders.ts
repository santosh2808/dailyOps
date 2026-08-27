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
  advancePercentage?: number;
  gstPercent?: number;
  discount?: number;
  billingAddress?: string;
  shippingAddress?: string;
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

export async function updateSalesOrderStatus(id: string, status: SalesOrderStatus, dispatchOverrideNote?: string) {
  const res = await api.patch<SalesOrder>(`/api/v1/sales-orders/${id}/status`, { status, dispatchOverrideNote });
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
