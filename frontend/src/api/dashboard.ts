import api from "@/lib/api";
import type { DashboardStats } from "@/types";

export async function getDashboardStats() {
  const res = await api.get<DashboardStats>("/api/v1/dashboard/stats");
  return res.data;
}
