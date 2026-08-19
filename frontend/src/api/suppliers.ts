import api from "@/lib/api";
import type { PaginatedResponse, Supplier, SupplierImportSummary, SupplierStatus } from "@/types";

export interface SupplierListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: SupplierStatus;
  country?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

// supplierCode is deliberately absent — it is always auto-generated
// server-side (SuppliersService.generateSupplierCode()), same convention as
// Lead.leadNumber.
export interface SupplierPayload {
  supplierName: string;
  gstNumber?: string;
  panNumber?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  pinCode?: string;
  paymentTerms?: string;
  leadTime?: number;
  currency?: string;
  remarks?: string;
  status?: SupplierStatus;
}

export async function listSuppliers(params: SupplierListParams) {
  const res = await api.get<PaginatedResponse<Supplier>>("/api/v1/suppliers", { params });
  return res.data;
}

export async function getSupplier(id: string) {
  const res = await api.get<Supplier>(`/api/v1/suppliers/${id}`);
  return res.data;
}

export async function createSupplier(payload: SupplierPayload) {
  const res = await api.post<Supplier>("/api/v1/suppliers", payload);
  return res.data;
}

export async function updateSupplier(id: string, payload: Partial<SupplierPayload>) {
  const res = await api.patch<Supplier>(`/api/v1/suppliers/${id}`, payload);
  return res.data;
}

export async function deleteSupplier(id: string) {
  const res = await api.delete<Supplier>(`/api/v1/suppliers/${id}`);
  return res.data;
}

export async function downloadSupplierImportTemplate() {
  const res = await api.get("/api/v1/suppliers/import/template", { responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", "supplier-import-template.xlsx");
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function exportSuppliers() {
  const res = await api.get("/api/v1/suppliers/export", { responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", "suppliers-export.xlsx");
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function previewSupplierImport(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await api.post<SupplierImportSummary>("/api/v1/suppliers/import/preview", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

// Sends back the rows the Preview step returned as 'valid' (the caller
// filters those out before calling this) so the file doesn't need to be
// re-uploaded/re-parsed. The backend re-validates and re-checks duplicates
// on every row anyway, rather than trusting this filtering blindly — same
// convention as Lead Import's importLeads().
export async function importSuppliers(rows: SupplierImportSummary["rows"]) {
  const res = await api.post<SupplierImportSummary>("/api/v1/suppliers/import", { rows });
  return res.data;
}
