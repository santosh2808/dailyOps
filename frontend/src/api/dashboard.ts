import api from "@/lib/api";
import type {
  DashboardCharts,
  DashboardFilters,
  DashboardStats,
  ExecutivePerformanceEntry,
  FunnelStage,
  RecentActivityEntry,
  RevenuePeriod,
  RevenuePoint,
  StateSalesEntry,
  TodaysFollowUpEntry,
  TopProductEntry,
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

export interface RevenueQueryParams extends DashboardFilters {
  period: RevenuePeriod;
  // period's own month/year (bucketing) — see DashboardFilters.month/year
  // for the separate Global Filters meaning; both happen to share param
  // names on this one endpoint only, see dashboard.controller.ts.
}

export async function getDashboardRevenue(params: RevenueQueryParams) {
  const res = await api.get<RevenuePoint[]>("/api/v1/dashboard/revenue", { params });
  return res.data;
}

export async function getDashboardExecutives(filters: DashboardFilters = {}) {
  const res = await api.get<ExecutivePerformanceEntry[]>("/api/v1/dashboard/executives", {
    params: filters,
  });
  return res.data;
}

export async function getDashboardCharts() {
  const res = await api.get<DashboardCharts>("/api/v1/dashboard/charts");
  return res.data;
}

// Additive: Dashboard Redesign v2 client functions.

export async function getDashboardSalesByState(filters: DashboardFilters = {}) {
  const res = await api.get<StateSalesEntry[]>("/api/v1/dashboard/sales-by-state", {
    params: filters,
  });
  return res.data;
}

export async function getDashboardTopProducts(filters: DashboardFilters = {}) {
  const res = await api.get<TopProductEntry[]>("/api/v1/dashboard/top-products", {
    params: filters,
  });
  return res.data;
}

export async function getDashboardRecentActivities() {
  const res = await api.get<RecentActivityEntry[]>("/api/v1/dashboard/recent-activities");
  return res.data;
}

export async function getDashboardTodaysFollowUps() {
  const res = await api.get<TodaysFollowUpEntry[]>("/api/v1/dashboard/todays-followups");
  return res.data;
}
