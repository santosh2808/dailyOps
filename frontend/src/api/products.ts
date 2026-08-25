import api from "@/lib/api";
import type { Product, ProductTechnicalSpec, PaginatedResponse } from "@/types";

export interface ProductListParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
}

export interface ProductPayload {
  name: string;
  category: string;
  sku?: string;
  description?: string;
  price?: number;
  // Additive: Sales Automation price validation.
  standardPrice?: number;
  minPrice?: number;
  maxDiscountPercent?: number;
  // Additive: Techno-Commercial Offer PDF.
  technicalSpec?: ProductTechnicalSpec;
}

export async function listProducts(params: ProductListParams) {
  const res = await api.get<PaginatedResponse<Product>>("/api/v1/products", {
    params,
  });
  return res.data;
}

export async function getProductCategories() {
  const res = await api.get<string[]>("/api/v1/products/categories");
  return res.data;
}

export async function getProduct(id: string) {
  const res = await api.get<Product>(`/api/v1/products/${id}`);
  return res.data;
}

export async function createProduct(payload: ProductPayload) {
  const res = await api.post<Product>("/api/v1/products", payload);
  return res.data;
}

export async function updateProduct(id: string, payload: Partial<ProductPayload>) {
  const res = await api.patch<Product>(`/api/v1/products/${id}`, payload);
  return res.data;
}

export async function deactivateProduct(id: string) {
  const res = await api.delete<Product>(`/api/v1/products/${id}`);
  return res.data;
}
