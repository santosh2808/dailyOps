import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  RefreshCw,
  Users,
  UserPlus,
  FileText,
  ClipboardList,
  Wallet,
  Truck,
  CalendarClock,
  Hourglass,
  ShieldAlert,
  Clock3,
  Plus,
  FileSpreadsheet,
  PackageSearch,
} from "lucide-react";
import {
  ResponsiveContainer,
  FunnelChart,
  Funnel,
  LabelList,
  Cell,
  PieChart,
  Pie,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { STATUS_OPTIONS as LEAD_STATUS_OPTIONS, sourceLabel } from "@/components/leads/leadOptions";
import {
  getDashboardCharts,
  getDashboardExecutives,
  getDashboardFunnel,
  getDashboardRevenue,
  getDashboardStats,
} from "@/api/dashboard";
import type {
  DashboardCharts as DashboardChartsData,
  DashboardStats,
  ExecutivePerformanceEntry,
  FunnelStage,
  RevenuePeriod,
  RevenuePoint,
} from "@/types";

// Dashboard Redesign — every widget on this page is read-only reporting
// over data that already exists elsewhere in the app; nothing here changes
// any business logic. Clicking a card/slice/bar navigates to the module
// that owns that data with whatever filter that module's list page already
// supports pre-applied via the URL query string (see the *List.tsx pages'
// own `initialFiltersFromSearchParams` additions for the read side of
// this). Where a module's existing filters can't express something exactly
// (e.g. "today's follow-ups" — Lead has no nextFollowUp filter param), the
// click still opens the right page, just unfiltered; that's called out
// inline below rather than silently pretending it works.

const SRM_GREEN = "#9BBB3D";
const SRM_RED = "#ED3525";

const DONUT_PALETTE = [
  "#9BBB3D",
  "#ED3525",
  "#f59e0b",
  "#0ea5e9",
  "#8b5cf6",
  "#64748b",
  "#14b8a6",
  "#f472b6",
  "#84cc16",
  "#facc15",
];

// Order must match dashboard.service.ts getCharts()'s Object.entries()
// insertion order for these two buckets.
const PRODUCTION_COLORS = ["#64748b", "#f59e0b", SRM_GREEN, "#5f7726"];
const INVENTORY_COLORS = [SRM_GREEN, "#f59e0b", "#fb7185", SRM_RED];

const PRODUCTION_STATUS_LINK: Record<string, string> = {
  Pending: "/job-execution-orders?status=PENDING",
  Ready: "/job-execution-orders?status=READY_FOR_DISPATCH",
  Completed: "/job-execution-orders?status=COMPLETED",
  // "In Production" merges 3 JeoStatus values (MATERIAL_READY,
  // ASSEMBLY_STARTED, QC) — the list page's status filter only takes one
  // value, so this opens the list unfiltered rather than guessing one.
  "In Production": "/job-execution-orders",
};

const INVENTORY_STATUS_LINK: Record<string, string> = {
  Healthy: "/materials",
  "Low Stock": "/materials?stockStatus=low_stock",
  // Materials only supports stockStatus=low_stock|out_of_stock — Critical
  // (currentStock <= minimumStock) is a subset of low_stock, so this is the
  // closest real filter rather than an unfiltered fallback.
  Critical: "/materials?stockStatus=low_stock",
  "Out of Stock": "/materials?stockStatus=out_of_stock",
};

const FUNNEL_COLORS = ["#c3d68b", "#afc865", SRM_GREEN, "#87a636", "#738f2e", "#5f7726", "#4b5f1e"];

const FUNNEL_LINKS: Record<string, string> = {
  Lead: "/leads",
  Qualified: "/leads?status=QUALIFIED",
  Quotation: "/quotations",
  Won: "/quotations?status=ACCEPTED",
  "Sales Order": "/sales-orders",
  Production: "/sales-orders?status=PRODUCTION_STARTED",
  Dispatch: "/sales-orders?status=READY_FOR_DISPATCH",
};

const REVENUE_PERIODS: RevenuePeriod[] = ["weekly", "monthly", "quarterly", "yearly"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function yearOptions(currentYear: number) {
  return [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
}

// Mirrors dashboard.service.ts getRevenue()'s own bucketing exactly, so a
// bar's date range always matches the bucket it was drawn from.
function revenueBucketRange(period: RevenuePeriod, index: number, month: number, year: number) {
  if (period === "yearly") {
    const y = year - 4 + index;
    return { dateFrom: isoDate(y, 1, 1), dateTo: isoDate(y, 12, 31) };
  }
  if (period === "quarterly") {
    const startMonth = index * 3 + 1;
    const endMonth = startMonth + 2;
    const endDay = new Date(year, endMonth, 0).getDate();
    return { dateFrom: isoDate(year, startMonth, 1), dateTo: isoDate(year, endMonth, endDay) };
  }
  if (period === "monthly") {
    const endDay = new Date(year, index + 1, 0).getDate();
    return { dateFrom: isoDate(year, index + 1, 1), dateTo: isoDate(year, index + 1, endDay) };
  }
  const daysInMonth = new Date(year, month, 0).getDate();
  const startDay = index * 7 + 1;
  const endDay = Math.min(startDay + 6, daysInMonth);
  return { dateFrom: isoDate(year, month, startDay), dateTo: isoDate(year, month, endDay) };
}

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  loading: boolean;
  onClick: () => void;
}

function KpiCard({ label, value, icon: Icon, loading, onClick }: KpiCardProps) {
  return (
    <button type="button" onClick={onClick} className="w-full text-left">
      <Card className="border-none shadow-sm transition-shadow hover:shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-srm-green/10 text-srm-green">
            <Icon className="h-4 w-4" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-slate-900">
            {loading ? (
              <span className="inline-block h-7 w-16 animate-pulse rounded bg-slate-200" />
            ) : (
              value
            )}
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

interface DonutCardProps {
  title: string;
  data: { name: string; value: number }[];
  colors: string[];
  emptyLabel: string;
  onSliceClick: (name: string) => void;
}

function DonutCard({ title, data, colors, emptyLabel, onSliceClick }: DonutCardProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={48}
                outerRadius={78}
                paddingAngle={2}
                onClick={(entry) => onSliceClick(String(entry.name))}
              >
                {data.map((entry, i) => (
                  <Cell key={entry.name} fill={colors[i % colors.length]} cursor="pointer" />
                ))}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

interface SummaryCardProps {
  title: string;
  entries: { name: string; value: number }[];
  colors: Record<string, string>;
  emptyLabel: string;
  onEntryClick: (name: string) => void;
}

function SummaryCard({ title, entries, colors, emptyLabel, onEntryClick }: SummaryCardProps) {
  const total = entries.reduce((sum, e) => sum + e.value, 0);
  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {entries.map((entry) => (
              <button
                key={entry.name}
                type="button"
                onClick={() => onEntryClick(entry.name)}
                className="rounded-md border border-slate-100 p-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="text-xs font-medium text-muted-foreground">{entry.name}</div>
                <div className="mt-1 text-xl font-bold" style={{ color: colors[entry.name] ?? "#23252d" }}>
                  {entry.value}
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface NotificationRowProps {
  label: string;
  count: number;
  icon: LucideIcon;
  onClick: () => void;
}

function NotificationRow({ label, count, icon: Icon, onClick }: NotificationRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left transition-colors hover:bg-slate-50"
    >
      <span className="flex items-center gap-2 text-sm text-slate-700">
        <Icon className="h-4 w-4 text-srm-green" />
        {label}
      </span>
      <span className={cn("text-sm font-semibold", count > 0 ? "text-srm-red" : "text-slate-400")}>
        {count}
      </span>
    </button>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [funnel, setFunnel] = useState<FunnelStage[]>([]);
  const [charts, setCharts] = useState<DashboardChartsData | null>(null);
  const [executives, setExecutives] = useState<ExecutivePerformanceEntry[]>([]);
  const [monthRevenue, setMonthRevenue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [revenuePeriod, setRevenuePeriod] = useState<RevenuePeriod>("monthly");
  const [revenueMonth, setRevenueMonth] = useState(currentMonth);
  const [revenueYear, setRevenueYear] = useState(currentYear);
  const [revenueSeries, setRevenueSeries] = useState<RevenuePoint[]>([]);
  const [revenueLoading, setRevenueLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [statsData, funnelData, chartsData, executivesData, thisMonthRevenue] = await Promise.all([
        getDashboardStats(),
        getDashboardFunnel(),
        getDashboardCharts(),
        getDashboardExecutives(),
        getDashboardRevenue({ period: "monthly", year: currentYear }),
      ]);
      setStats(statsData);
      setFunnel(funnelData);
      setCharts(chartsData);
      setExecutives(executivesData);
      setMonthRevenue(thisMonthRevenue[now.getMonth()]?.value ?? 0);
    } catch {
      setError("Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    function handleFocus() {
      fetchDashboard();
    }
    function handleVisibility() {
      if (document.visibilityState === "visible") fetchDashboard();
    }
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchDashboard]);

  const fetchRevenue = useCallback(async () => {
    setRevenueLoading(true);
    try {
      const data = await getDashboardRevenue({
        period: revenuePeriod,
        month: revenueMonth,
        year: revenueYear,
      });
      setRevenueSeries(data);
    } catch {
      setRevenueSeries([]);
    } finally {
      setRevenueLoading(false);
    }
  }, [revenuePeriod, revenueMonth, revenueYear]);

  useEffect(() => {
    fetchRevenue();
  }, [fetchRevenue]);

  const leadSourceData = (stats?.leadSourceSummary ?? []).map((entry) => ({
    name: sourceLabel(entry.source),
    value: entry.count,
    source: entry.source,
  }));
  const leadStatusData = (charts?.leadStatus ?? []).map((entry) => ({
    name: entry.label,
    value: entry.count,
  }));
  const productionStatusData = (charts?.productionStatus ?? []).map((entry) => ({
    name: entry.label,
    value: entry.count,
  }));
  const inventoryStatusData = (charts?.inventoryStatus ?? []).map((entry) => ({
    name: entry.label,
    value: entry.count,
  }));

  const monthEndDay = new Date(currentYear, currentMonth, 0).getDate();

  return (
    <div className="flex h-screen bg-app-grid">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="Dashboard" />
        <main className="flex-1 space-y-6 overflow-y-auto p-6">
          {error && (
            <div className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <span className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {error}
              </span>
              <Button variant="outline" size="sm" onClick={fetchDashboard}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          )}

          {/* 1. Top KPI Cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <KpiCard
              label="Customers"
              value={stats?.customers ?? 0}
              icon={Users}
              loading={loading}
              onClick={() => navigate("/customers")}
            />
            <KpiCard
              label="Leads"
              value={stats?.leads ?? 0}
              icon={UserPlus}
              loading={loading}
              onClick={() => navigate("/leads")}
            />
            <KpiCard
              label="Quotations"
              value={stats?.quotations ?? 0}
              icon={FileText}
              loading={loading}
              onClick={() => navigate("/quotations")}
            />
            <KpiCard
              label="Sales Orders"
              value={stats?.salesOrders ?? 0}
              icon={ClipboardList}
              loading={loading}
              onClick={() => navigate("/sales-orders")}
            />
            <KpiCard
              label="Revenue (This Month)"
              value={formatINR(monthRevenue)}
              icon={Wallet}
              loading={loading}
              onClick={() =>
                navigate(
                  `/sales-orders?dateFrom=${isoDate(currentYear, currentMonth, 1)}&dateTo=${isoDate(
                    currentYear,
                    currentMonth,
                    monthEndDay,
                  )}`,
                )
              }
            />
            <KpiCard
              label="Dispatch"
              value={stats?.dispatchCount ?? 0}
              icon={Truck}
              loading={loading}
              onClick={() => navigate("/sales-orders?status=DISPATCHED")}
            />
          </div>

          {/* 2. Sales Funnel */}
          <Card className="border-none shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Sales Funnel</CardTitle>
            </CardHeader>
            <CardContent>
              {funnel.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={340}>
                  <FunnelChart>
                    <Tooltip />
                    <Funnel dataKey="count" data={funnel} isAnimationActive nameKey="stage">
                      <LabelList dataKey="stage" position="right" fill="#23252d" stroke="none" fontSize={13} />
                      <LabelList dataKey="count" position="center" fill="#ffffff" stroke="none" fontSize={13} />
                      {funnel.map((entry, i) => (
                        <Cell
                          key={entry.stage}
                          fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]}
                          cursor="pointer"
                          onClick={() => {
                            const link = FUNNEL_LINKS[entry.stage];
                            if (link) navigate(link);
                          }}
                        />
                      ))}
                    </Funnel>
                  </FunnelChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* 3. Donut Charts */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DonutCard
              title="Lead Sources"
              data={leadSourceData}
              colors={DONUT_PALETTE}
              emptyLabel="No leads yet."
              onSliceClick={(name) => {
                const entry = leadSourceData.find((d) => d.name === name);
                if (entry) navigate(`/leads?source=${entry.source}`);
              }}
            />
            <DonutCard
              title="Lead Status"
              data={leadStatusData}
              colors={DONUT_PALETTE}
              emptyLabel="No leads yet."
              onSliceClick={(name) => {
                const option = LEAD_STATUS_OPTIONS.find((o) => o.label === name);
                if (option) navigate(`/leads?status=${option.value}`);
              }}
            />
            <DonutCard
              title="Production Status"
              data={productionStatusData}
              colors={PRODUCTION_COLORS}
              emptyLabel="No job execution orders yet."
              onSliceClick={(name) => navigate(PRODUCTION_STATUS_LINK[name] ?? "/job-execution-orders")}
            />
            <DonutCard
              title="Inventory Status"
              data={inventoryStatusData}
              colors={INVENTORY_COLORS}
              emptyLabel="No materials yet."
              onSliceClick={(name) => navigate(INVENTORY_STATUS_LINK[name] ?? "/materials")}
            />
          </div>

          {/* 4. Revenue Chart */}
          <Card className="border-none shadow-sm">
            <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">Revenue</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                {REVENUE_PERIODS.map((period) => (
                  <Button
                    key={period}
                    type="button"
                    size="sm"
                    variant={revenuePeriod === period ? "default" : "outline"}
                    className={revenuePeriod === period ? "bg-srm-green hover:bg-srm-green/90" : ""}
                    onClick={() => setRevenuePeriod(period)}
                  >
                    {period[0].toUpperCase() + period.slice(1)}
                  </Button>
                ))}
                {revenuePeriod === "weekly" && (
                  <Select
                    value={revenueMonth}
                    onChange={(e) => setRevenueMonth(Number(e.target.value))}
                    className="w-32"
                  >
                    {MONTH_NAMES.map((m, i) => (
                      <option key={m} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </Select>
                )}
                {revenuePeriod !== "yearly" && (
                  <Select
                    value={revenueYear}
                    onChange={(e) => setRevenueYear(Number(e.target.value))}
                    className="w-24"
                  >
                    {yearOptions(currentYear).map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </Select>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {revenueLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : revenueSeries.every((p) => p.value === 0) ? (
                <p className="text-sm text-muted-foreground">No revenue in this range yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={revenueSeries}
                    onClick={(state) => {
                      const index = state?.activeTooltipIndex;
                      if (index == null) return;
                      const parsedIndex = Number(index);
                      if (Number.isNaN(parsedIndex)) return;
                      const { dateFrom, dateTo } = revenueBucketRange(
                        revenuePeriod,
                        parsedIndex,
                        revenueMonth,
                        revenueYear,
                      );
                      navigate(`/sales-orders?dateFrom=${dateFrom}&dateTo=${dateTo}`);
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₹${Math.round(Number(v) / 1000)}k`} />
                    <Tooltip formatter={(value) => formatINR(Number(value))} />
                    <Bar dataKey="value" name="Revenue" fill={SRM_GREEN} radius={[4, 4, 0, 0]} cursor="pointer" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* 5. Sales Executive Performance */}
          <Card className="border-none shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Sales Executive Performance</CardTitle>
            </CardHeader>
            <CardContent>
              {executives.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sales orders yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-4 font-medium">Executive</th>
                        <th className="py-2 pr-4 font-medium">Revenue</th>
                        <th className="py-2 pr-4 font-medium">Orders</th>
                        <th className="py-2 pr-4 font-medium">Won %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {executives.map((entry) => (
                        <tr
                          key={entry.executive}
                          className="cursor-pointer border-b last:border-0 hover:bg-slate-50"
                          // No createdBy/executive filter exists on the Sales
                          // Orders list today (see ExecutivePerformanceEntry's
                          // comment) — opens the list unfiltered rather than
                          // guessing a filter that isn't there.
                          onClick={() => navigate("/sales-orders")}
                        >
                          <td className="py-2 pr-4 font-medium text-slate-900">{entry.executive}</td>
                          <td className="py-2 pr-4">{formatINR(entry.revenue)}</td>
                          <td className="py-2 pr-4">{entry.orders}</td>
                          <td className="py-2 pr-4">{entry.wonPercent}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 6 & 7. Production + Inventory Summary */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SummaryCard
              title="Production Summary"
              entries={productionStatusData}
              colors={{
                Pending: PRODUCTION_COLORS[0],
                "In Production": PRODUCTION_COLORS[1],
                Ready: PRODUCTION_COLORS[2],
                Completed: PRODUCTION_COLORS[3],
              }}
              emptyLabel="No job execution orders yet."
              onEntryClick={(name) => navigate(PRODUCTION_STATUS_LINK[name] ?? "/job-execution-orders")}
            />
            <SummaryCard
              title="Inventory Summary"
              entries={inventoryStatusData}
              colors={{
                Healthy: INVENTORY_COLORS[0],
                "Low Stock": INVENTORY_COLORS[1],
                Critical: INVENTORY_COLORS[2],
                "Out of Stock": INVENTORY_COLORS[3],
              }}
              emptyLabel="No materials yet."
              onEntryClick={(name) => navigate(INVENTORY_STATUS_LINK[name] ?? "/materials")}
            />
          </div>

          {/* 8. Notifications + 9. Quick Actions */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="border-none shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Notifications</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <NotificationRow
                  label="Today's Follow-ups"
                  count={stats?.todaysFollowUpsCount ?? 0}
                  icon={CalendarClock}
                  // Lead's list filters don't include nextFollowUp — opens
                  // the Leads list unfiltered.
                  onClick={() => navigate("/leads")}
                />
                <NotificationRow
                  label="Pending Quotations"
                  count={stats?.pendingQuotationsCount ?? 0}
                  icon={Hourglass}
                  // "Pending" here is DRAFT or READY; the list filter only
                  // takes one status, so this opens on DRAFT (the earlier,
                  // more actionable of the two).
                  onClick={() => navigate("/quotations?status=DRAFT")}
                />
                <NotificationRow
                  label="Pending Approvals"
                  count={stats?.pendingApprovalsCount ?? 0}
                  icon={ShieldAlert}
                  onClick={() => navigate("/quotations/approvals")}
                />
                <NotificationRow
                  label="Delayed Orders"
                  count={stats?.delayedOrdersCount ?? 0}
                  icon={Clock3}
                  // No "overdue" filter exists on the Sales Orders list —
                  // opens the list unfiltered.
                  onClick={() => navigate("/sales-orders")}
                />
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                  className="justify-start bg-srm-green hover:bg-srm-green/90"
                  onClick={() => navigate("/leads/new")}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create Lead
                </Button>
                <Button
                  className="justify-start bg-srm-green hover:bg-srm-green/90"
                  onClick={() => navigate("/quotations/new")}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create Quotation
                </Button>
                <Button
                  className="justify-start bg-srm-green hover:bg-srm-green/90"
                  onClick={() => navigate("/sales-orders/new")}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create Sales Order
                </Button>
                {/* A Proforma Invoice / JEO can only be generated from a
                    specific Sales Order (via the "Generate Proforma
                    Invoice"/"Generate JEO" buttons on that order's own Details
                    page) — there's no standalone create form. These open the
                    Sales Orders list filtered to CONFIRMED orders, the status
                    most likely to still need a PI/JEO generated. */}
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => navigate("/sales-orders?status=CONFIRMED")}
                >
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Generate PI
                </Button>
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => navigate("/sales-orders?status=CONFIRMED")}
                >
                  <PackageSearch className="mr-2 h-4 w-4" />
                  Generate JEO
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
