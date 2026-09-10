import api from "@/lib/api";
import type { AiSettings, PreferredLanguage } from "@/types";

// D.O.T. AI Lead Assistant Phase 1 — foundation-only settings. Editing
// these never places a call by itself.
export interface AiSettingsPayload {
  aiCallingEnabled?: boolean;
  callNewMarketingLeadsEnabled?: boolean;
  maxCallAttempts?: number;
  callingHoursStart?: string;
  callingHoursEnd?: string;
  defaultDelayMinutes?: number;
  supportedLanguages?: PreferredLanguage[];
}

export async function getAiSettings() {
  const res = await api.get<AiSettings>("/api/v1/ai-settings");
  return res.data;
}

export async function updateAiSettings(payload: AiSettingsPayload) {
  const res = await api.patch<AiSettings>("/api/v1/ai-settings", payload);
  return res.data;
}
