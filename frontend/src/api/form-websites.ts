import api from "@/lib/api";
import type {
  FormDefinition,
  FormSubjectRoute,
  FormVersion,
  FormWebsite,
  FormWebsiteProduct,
  FormWebsiteStatus,
  FormDestinationType,
  PaginatedResponse,
} from "@/types";

export interface FormWebsiteListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: FormWebsiteStatus;
}

export interface FormWebsitePayload {
  code: string;
  name: string;
  supportEmail?: string;
  allowedOrigins?: string[];
  configuration?: Record<string, unknown>;
}

export interface FormDefinitionPayload {
  code: string;
  name: string;
  enabled?: boolean;
  supportEmail?: string;
  configuration?: Record<string, unknown>;
}

export interface FormVersionPayload {
  schema: { fields: Record<string, { type: "string" | "number" | "boolean"; required?: boolean }> };
  publish?: boolean;
}

export async function listFormWebsites(params: FormWebsiteListParams) {
  const res = await api.get<PaginatedResponse<FormWebsite>>("/api/v1/form-configuration/websites", { params });
  return res.data;
}

export async function getFormWebsite(id: string) {
  const res = await api.get<FormWebsite>(`/api/v1/form-configuration/websites/${id}`);
  return res.data;
}

export async function createFormWebsite(payload: FormWebsitePayload) {
  const res = await api.post<FormWebsite>("/api/v1/form-configuration/websites", payload);
  return res.data;
}

export async function updateFormWebsite(id: string, payload: Partial<FormWebsitePayload> & { status?: FormWebsiteStatus }) {
  const res = await api.patch<FormWebsite>(`/api/v1/form-configuration/websites/${id}`, payload);
  return res.data;
}

export async function createFormDefinition(websiteId: string, payload: FormDefinitionPayload) {
  const res = await api.post<FormDefinition>(`/api/v1/form-configuration/websites/${websiteId}/forms`, payload);
  return res.data;
}

export async function updateFormDefinition(websiteId: string, formId: string, payload: Partial<FormDefinitionPayload>) {
  const res = await api.patch<FormDefinition>(
    `/api/v1/form-configuration/websites/${websiteId}/forms/${formId}`,
    payload,
  );
  return res.data;
}

export async function createFormVersion(websiteId: string, formId: string, payload: FormVersionPayload) {
  const res = await api.post<FormVersion>(
    `/api/v1/form-configuration/websites/${websiteId}/forms/${formId}/versions`,
    payload,
  );
  return res.data;
}

export async function publishFormVersion(websiteId: string, formId: string, versionId: string) {
  const res = await api.post<FormVersion>(
    `/api/v1/form-configuration/websites/${websiteId}/forms/${formId}/versions/${versionId}/publish`,
  );
  return res.data;
}

// -------------------------------------------------------------------
// Product Mappings (FormWebsiteProduct)
// -------------------------------------------------------------------

export interface FormWebsiteProductPayload {
  productId: string;
  publicCode: string;
  label: string;
  enabled?: boolean;
  displayOrder?: number;
  fieldConfig?: Record<string, unknown>;
}

export async function listFormWebsiteProducts(websiteId: string) {
  const res = await api.get<FormWebsiteProduct[]>(`/api/v1/form-configuration/websites/${websiteId}/products`);
  return res.data;
}

export async function createFormWebsiteProduct(websiteId: string, payload: FormWebsiteProductPayload) {
  const res = await api.post<FormWebsiteProduct>(`/api/v1/form-configuration/websites/${websiteId}/products`, payload);
  return res.data;
}

export async function updateFormWebsiteProduct(
  websiteId: string,
  productMappingId: string,
  payload: Partial<Omit<FormWebsiteProductPayload, "productId">>,
) {
  const res = await api.patch<FormWebsiteProduct>(
    `/api/v1/form-configuration/websites/${websiteId}/products/${productMappingId}`,
    payload,
  );
  return res.data;
}

export async function deleteFormWebsiteProduct(websiteId: string, productMappingId: string) {
  const res = await api.delete<FormWebsiteProduct>(
    `/api/v1/form-configuration/websites/${websiteId}/products/${productMappingId}`,
  );
  return res.data;
}

// -------------------------------------------------------------------
// Subject Routes (FormSubjectRoute)
// -------------------------------------------------------------------

export interface FormSubjectRoutePayload {
  subjectCode: string;
  subjectLabel: string;
  destinationType: FormDestinationType;
  productId?: string | null;
  departmentId?: string | null;
  assignedUserId?: string | null;
  priority?: number;
  enabled?: boolean;
}

export async function listFormSubjectRoutes(formDefinitionId: string) {
  const res = await api.get<FormSubjectRoute[]>(`/api/v1/form-configuration/forms/${formDefinitionId}/routes`);
  return res.data;
}

export async function createFormSubjectRoute(formDefinitionId: string, payload: FormSubjectRoutePayload) {
  const res = await api.post<FormSubjectRoute>(
    `/api/v1/form-configuration/forms/${formDefinitionId}/routes`,
    payload,
  );
  return res.data;
}

export async function updateFormSubjectRoute(
  formDefinitionId: string,
  routeId: string,
  payload: Partial<Omit<FormSubjectRoutePayload, "subjectCode">>,
) {
  const res = await api.patch<FormSubjectRoute>(
    `/api/v1/form-configuration/forms/${formDefinitionId}/routes/${routeId}`,
    payload,
  );
  return res.data;
}

export async function deleteFormSubjectRoute(formDefinitionId: string, routeId: string) {
  const res = await api.delete<FormSubjectRoute>(
    `/api/v1/form-configuration/forms/${formDefinitionId}/routes/${routeId}`,
  );
  return res.data;
}
