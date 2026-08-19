import api from "@/lib/api";
import type { Customer, PaginatedResponse } from "@/types";

export interface CustomerListParams {
  page?: number;
  limit?: number;
  search?: string;
}

export interface CustomerPayload {
  companyName: string;
  contactPerson: string;
  phone: string;
  email?: string;
  gstNumber?: string;
}

export async function listCustomers(params: CustomerListParams) {
  const res = await api.get<PaginatedResponse<Customer>>("/api/v1/customers", {
    params,
  });
  return res.data;
}

export async function getCustomer(id: string) {
  const res = await api.get<Customer>(`/api/v1/customers/${id}`);
  return res.data;
}

export async function createCustomer(payload: CustomerPayload) {
  const res = await api.post<Customer>("/api/v1/customers", payload);
  return res.data;
}

export async function updateCustomer(id: string, payload: Partial<CustomerPayload>) {
  const res = await api.patch<Customer>(`/api/v1/customers/${id}`, payload);
  return res.data;
}

export async function deactivateCustomer(id: string) {
  const res = await api.delete<Customer>(`/api/v1/customers/${id}`);
  return res.data;
}
