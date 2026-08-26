import api from "@/lib/api";
import type {
  DashboardCharts,
  DashboardStats,
  ExecutivePerformanceEntry,
  FunnelStage,
  RevenuePeriod,
  RevenuePoint,
} from "@/types";

export async function getDashboardStats() {
  const res = await api.get<DashboardStats>("/api/v1/dashboard/stats");
  return res.data;
}

// Additive: Dashboard Redesign client functions — each backs one new
// GET /api/v1/dashboard/* endpoint added in dashboard.controller.ts.

export async function getDashboardFunnel() {
  const res = await api.get<FunnelStage[]>("/api/v1/dashboard/funnel");
  return res.data;
}

export interface RevenueQueryParams {
  period: RevenuePeriod;
  month?: number;
  year?: number;
}

export async function getDashboardRevenue(params: RevenueQueryParams) {
  const res = await api.get<RevenuePoint[]>("/api/v1/dashboard/revenue", { params });
  return res.data;
}

export async function getDashboardExecutives() {
  const res = await api.get<ExecutivePerformanceEntry[]>("/api/v1/dashboard/executives");
  return res.data;
}

export async function getDashboardCharts() {
  const res = await api.get<DashboardCharts>("/api/v1/dashboard/charts");
  return res.data;
}
