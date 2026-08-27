import api from "@/lib/api";
import type { StateSeriesCode } from "@/types";

export interface StateSeriesCodePayload {
  state: string;
  seriesStart: number;
}

export async function listStateSeriesCodes() {
  const res = await api.get<StateSeriesCode[]>("/api/v1/state-series-codes");
  return res.data;
}

export async function createStateSeriesCode(payload: StateSeriesCodePayload) {
  const res = await api.post<StateSeriesCode>("/api/v1/state-series-codes", payload);
  return res.data;
}

export async function deleteStateSeriesCode(id: string) {
  const res = await api.delete<StateSeriesCode>(`/api/v1/state-series-codes/${id}`);
  return res.data;
}
