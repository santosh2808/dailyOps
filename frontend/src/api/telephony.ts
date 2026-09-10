import api from "@/lib/api";
import type { TelephonyStatus, TelephonyTestCall } from "@/types";

// D.O.T. AI Lead Assistant Phase 2A — Telephony Test Foundation. Every call
// here is admin-only (Telephony.Test permission, enforced server-side) and
// makeTestCall() is the ONLY way this frontend ever triggers a real call —
// nothing here polls, schedules, or auto-retries.
export interface TestCallPayload {
  phone: string;
  leadId?: string;
}

export async function getTelephonyStatus() {
  const res = await api.get<TelephonyStatus>("/api/v1/telephony/status");
  return res.data;
}

export async function getTestCalls(take?: number) {
  const res = await api.get<TelephonyTestCall[]>("/api/v1/telephony/test-calls", {
    params: take ? { take } : undefined,
  });
  return res.data;
}

export async function makeTestCall(payload: TestCallPayload) {
  const res = await api.post<TelephonyTestCall>("/api/v1/telephony/test-call", payload);
  return res.data;
}
