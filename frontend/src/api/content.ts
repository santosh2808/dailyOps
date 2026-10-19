import api from "@/lib/api";
import type {
  ContentImage,
  ContentPost,
  ContentPostCounts,
  ContentPostListItem,
  ContentPostStatus,
  ContentPostType,
  ContentProductOption,
  ContentWebsiteOption,
  PaginatedResponse,
} from "@/types";

export interface ContentPostListParams {
  page?: number;
  limit?: number;
  formWebsiteId?: string;
  type?: ContentPostType;
  status?: ContentPostStatus;
  search?: string;
  category?: string;
  industry?: string;
  featured?: boolean;
  hasUnpublishedChanges?: boolean;
  sort?: ContentPostSort;
}

export type ContentPostSort = "updated_desc" | "published_desc" | "published_asc" | "title_asc" | "title_desc";

export interface ContentPostProductPayload {
  formWebsiteProductId: string;
  quantity: number;
}

export interface CreateContentPostPayload {
  formWebsiteId: string;
  type: ContentPostType;
  title: string;
  slug: string;
  featured?: boolean;
  seoTitle?: string;
  seoDescription?: string;
  data?: Record<string, unknown>;
  products?: ContentPostProductPayload[];
}

// Loaded version
export interface UpdateContentPostPayload {
  version: number;
  formWebsiteId?: string;
  title?: string;
  slug?: string;
  featured?: boolean;
  seoTitle?: string;
  seoDescription?: string;
  data?: Record<string, unknown>;
  products?: ContentPostProductPayload[];
}

export interface UploadedContentImage {
  key: string;
  url: string | null;
  contentType: string;
  sizeBytes: number;
}

export async function listContentWebsites() {
  const res = await api.get<ContentWebsiteOption[]>("/api/v1/content/websites");
  return res.data;
}

export async function listContentProductOptions(websiteId: string) {
  const res = await api.get<ContentProductOption[]>(`/api/v1/content/websites/${websiteId}/products`);
  return res.data;
}

export async function listContentPosts(params: ContentPostListParams) {
  const res = await api.get<PaginatedResponse<ContentPostListItem>>("/api/v1/content/posts", { params });
  return res.data;
}

export async function listContentPostCounts(params: ContentPostListParams) {
  const res = await api.get<ContentPostCounts>("/api/v1/content/posts/counts", { params });
  return res.data;
}

export async function getContentPost(id: string) {
  const res = await api.get<ContentPost>(`/api/v1/content/posts/${id}`);
  return res.data;
}

export async function createContentPost(payload: CreateContentPostPayload) {
  const res = await api.post<ContentPost>("/api/v1/content/posts", payload);
  return res.data;
}

export async function updateContentPost(id: string, payload: UpdateContentPostPayload) {
  const res = await api.patch<ContentPost>(`/api/v1/content/posts/${id}`, payload);
  return res.data;
}

export async function publishContentPost(id: string, version: number) {
  const res = await api.post<ContentPost>(`/api/v1/content/posts/${id}/publish`, { version });
  return res.data;
}

export async function unpublishContentPost(id: string, version: number) {
  const res = await api.post<ContentPost>(`/api/v1/content/posts/${id}/unpublish`, { version });
  return res.data;
}

export async function archiveContentPost(id: string, version: number) {
  const res = await api.post<ContentPost>(`/api/v1/content/posts/${id}/archive`, { version });
  return res.data;
}

export async function restoreContentPost(id: string, version: number) {
  const res = await api.post<ContentPost>(`/api/v1/content/posts/${id}/restore`, { version });
  return res.data;
}

// Archived only; permanent
export async function deleteContentPost(id: string) {
  await api.delete(`/api/v1/content/posts/${id}`);
}

export async function uploadContentImage(websiteId: string, file: File) {
  if (!websiteId) throw new Error("Choose a website first, then upload the image.");
  const formData = new FormData();
  formData.append("file", file);
  const res = await api.post<UploadedContentImage>(`/api/v1/content/websites/${websiteId}/images`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

// Uploaded to field
export function toContentImage(uploaded: UploadedContentImage, alt = ""): ContentImage {
  return { key: uploaded.key, alt, url: uploaded.url };
}
