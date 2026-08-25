import api from "@/lib/api";
import type { EmailTemplate } from "@/types";

export interface EmailTemplatePayload {
  key: string;
  name: string;
  subject: string;
  bodyHtml: string;
  isActive?: boolean;
}

export async function listEmailTemplates() {
  const res = await api.get<EmailTemplate[]>("/api/v1/email-templates");
  return res.data;
}

export async function getEmailTemplate(id: string) {
  const res = await api.get<EmailTemplate>(`/api/v1/email-templates/${id}`);
  return res.data;
}

export async function createEmailTemplate(payload: EmailTemplatePayload) {
  const res = await api.post<EmailTemplate>("/api/v1/email-templates", payload);
  return res.data;
}

export async function updateEmailTemplate(id: string, payload: Partial<Omit<EmailTemplatePayload, "key">>) {
  const res = await api.patch<EmailTemplate>(`/api/v1/email-templates/${id}`, payload);
  return res.data;
}
