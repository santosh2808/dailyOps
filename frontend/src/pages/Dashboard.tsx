import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  RefreshCw,
  Users,
  UserPlus,
  FileText,
  ClipboardList,
  Truck,
  CalendarClock,
  Hourglass,
  ShieldAlert,
  Clock3,
  Plus,
  FileSpreadsheet,
  PackageSearch,
  X,
  MessageSquareWarning,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SOURCE_OPTIONS, sourceLabel } from "@/components/leads/leadOptions";
import { INDIA_STATES } from "@/lib/indiaStates";
import { listProducts } from "@/api/products";
import IndiaSalesMap from "@/components/dashboard/IndiaSalesMap";
import {
  getDashboardCharts,
  getDashboardExecutives,
  getDashboardRevenue,
  getDashboardSalesByState,
  getDashboardStats,
  getDashboardTodaysFollowUps,
  getDashboardTopProducts,
} from "@/api/dashboard";
import type {
  DashboardCharts as DashboardChartsData,
  DashboardFilters,
  DashboardStats,
  ExecutivePerformanceEntry,
  LeadSource,
  RevenuePeriod,
  RevenuePoint,
  StateSalesEntry,
  TodaysFollowUpEntry,
  TopProductEntry,
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
//
// v2 notes:
// - The Sales Funnel is replaced by the India Sales Map, which renders
//   India's real state boundaries via the india-map-react package (MIT,
//   bundles its own boundary data) rather than a hand-built stand-in — see
//   components/dashboard/IndiaSalesMap.tsx.
// - The Donut Charts row now shows exactly the 4 v2 asked for — Lead
//   Source, Quotation Status, Production Status, Inventory Status — which
//   drops v1's Lead Status donut from view. That data is still fetched
//   (getDashboardCharts().leadStatus) in case something else needs it
//   later; it's just not rendered here anymore, per v2's own explicit list.
// - Global Filters (Month/State/Sales Executive/Lead Source/Product) only
//   apply to the SalesOrder-derived widgets: India Map, Top Products,
//   Executive Performance, and the non-date dimensions of Revenue Trend
//   (state/executive/leadSource/product — its own Week/Month/Quarter/Year
//   buttons remain the date control). The 4 donuts and Today's Follow-ups
//   are operational/pipeline snapshots, not sales figures, so they're
//   intentionally left unfiltered — matching how the backend endpoints
//   were built (see dashboard.service.ts).
// - Recent Activities (the audit-log timeline) was tried in an earlier
//   pass and dropped at the user's request — it didn't carry enough
//   signal to be worth the space.

const SRM_GREEN = "#9BBB3D";
const SRM_RED = "#ED3525";

// Lead Source is a neutral category breakdown (Website/Referral/Cold
// Call/...), not a good-vs-bad signal — so it deliberately does NOT reuse
// SRM green/red (those are reserved for "on-brand accent" and "alert/
// critical" respectively elsewhere on this dashboard). This is a plain
// categorical palette instead.
const LEAD_SOURCE_COLORS = [
  "#0ea5e9",
  "#8b5cf6",
  "#f59e0b",
  "#14b8a6",
  "#6366f1",
  "#f472b6",
  "#64748b",
  "#fb923c",
  "#a3e635",
  "#facc15",
];

// Order must match dashboard.service.ts getCharts()'s Object.entries()
// insertion order for these buckets.
const PRODUCTION_COLORS = ["#64748b", "#f59e0b", SRM_GREEN, "#5f7726"];
const INVENTORY_COLORS = [SRM_GREEN, "#f59e0b", "#fb7185", SRM_RED];
const QUOTATION_COLORS = ["#64748b", "#0ea5e9", "#f59e0b", SRM_GREEN, SRM_RED];

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

interface GlobalFiltersBarProps {
  filters: DashboardFilters;
  onChange: (next: DashboardFilters) => void;
  executiveOptions: string[];
  productOptions: { id: string; name: string }[];
  currentYear: number;
}

// v2 requirement #13. Scope of what this affects is documented in the
// file-level comment above.
function GlobalFiltersBar({ filters, onChange, executiveOptions, productOptions, currentYear }: GlobalFiltersBarProps) {
  const activeCount = Object.values(filters).filter(Boolean).length;
  return (
    <Card className="border-none shadow-sm">
      <CardContent className="flex flex-wrap items-center gap-3 py-4">
        <span className="text-sm font-medium text-slate-500">Global Filters</span>
        <Select
          value={filters.month ?? ""}
          onChange={(e) => onChange({ ...filters, month: e.target.value ? Number(e.target.value) : undefined })}
          className="w-36"
        >
          <option value="">All Months</option>
          {MONTH_NAMES.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </Select>
        <Select
          value={filters.year ?? ""}
          onChange={(e) => onChange({ ...filters, year: e.target.value ? Number(e.target.value) : undefined })}
          className="w-24"
        >
          <option value="">All Years</option>
          {yearOptions(currentYear).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
        <Select
          value={filters.state ?? ""}
          onChange={(e) => onChange({ ...filters, state: e.target.value || undefined })}
          className="w-44"
        >
          <option value="">All States</option>
          {INDIA_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select
          value={filters.executive ?? ""}
          onChange={(e) => onChange({ ...filters, executive: e.target.value || undefined })}
          className="w-44"
        >
          <option value="">All Executives</option>
          {executiveOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
        <Select
          value={filters.leadSource ?? ""}
          onChange={(e) => onChange({ ...filters, leadSource: (e.target.value || undefined) as LeadSource | undefined })}
          className="w-44"
        >
          <option value="">All Lead Sources</option>
          {SOURCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Select
          value={filters.productId ?? ""}
          onChange={(e) => onChange({ ...filters, productId: e.target.value || undefined })}
          className="w-48"
        >
          <option value="">All Products</option>
          {productOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => onChange({})} className="text-slate-500">
            <X className="mr-1 h-3.5 w-3.5" />
            Clear
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [charts, setCharts] = useState<DashboardChartsData | null>(null);
  const [todaysFollowUps, setTodaysFollowUps] = useState<TodaysFollowUpEntry[]>([]);
  const [productOptions, setProductOptions] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // v2: Global Filters (requirement #13).
  const [filters, setFilters] = useState<DashboardFilters>({});
  const [executives, setExecutives] = useState<ExecutivePerformanceEntry[]>([]);
  const [salesByState, setSalesByState] = useState<StateSalesEntry[]>([]);
  const [topProducts, setTopProducts] = useState<TopProductEntry[]>([]);
  const [filteredLoading, setFilteredLoading] = useState(true);

  const [revenuePeriod, setRevenuePeriod] = useState<RevenuePeriod>("monthly");
  const [revenueMonth, setRevenueMonth] = useState(currentMonth);
  const [revenueYear, setRevenueYear] = useState(currentYear);
  const [revenueSeries, setRevenueSeries] = useState<RevenuePoint[]>([]);
  const [revenueLoading, setRevenueLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [statsData, chartsData, followUps] = await Promise.all([
        getDashboardStats(),
        getDashboardCharts(),
        getDashboardTodaysFollowUps(),
      ]);
      setStats(statsData);
      setCharts(chartsData);
      setTodaysFollowUps(followUps);
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

  // Product dropdown options for the Global Filters bar — fetched once;
  // there are only a handful of SPYRO products today so one page covers
  // all of them without building a searchable combobox for this.
  useEffect(() => {
    listProducts({ limit: 100 })
      .then((res) => setProductOptions(res.data.map((p) => ({ id: p.id, name: p.name }))))
      .catch(() => setProductOptions([]));
  }, []);

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

  // v2: the SalesOrder-derived widgets — Executive Performance, India Sales
  // Map, Top Products — all re-fetch together whenever a Global Filter
  // changes.
  const fetchFiltered = useCallback(async () => {
    setFilteredLoading(true);
    try {
      const [executivesData, stateData, productsData] = await Promise.all([
        getDashboardExecutives(filters),
        getDashboardSalesByState(filters),
        getDashboardTopProducts(filters),
      ]);
      setExecutives(executivesData);
      setSalesByState(stateData);
      setTopProducts(productsData);
    } catch {
      // Leave whatever was last successfully loaded on screen rather than
      // blanking three widgets over one transient request failure.
    } finally {
      setFilteredLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchFiltered();
  }, [fetchFiltered]);

  // Stable dropdown options for "Sales Executive" — sourced from
  // DashboardStats.salesByExecutive (unfiltered) rather than the `executives`
  // state above, so the option list doesn't shrink as other filters narrow
  // the filtered result.
  const executiveOptions = useMemo(
    () => (stats?.salesByExecutive ?? []).map((e) => e.executive),
    [stats],
  );

  const fetchRevenue = useCallback(async () => {
    setRevenueLoading(true);
    try {
      const data = await getDashboardRevenue({
        period: revenuePeriod,
        month: revenueMonth,
        year: revenueYear,
        state: filters.state,
        executive: filters.executive,
        leadSource: filters.leadSource,
        productId: filters.productId,
      });
      setRevenueSeries(data);
    } catch {
      setRevenueSeries([]);
    } finally {
      setRevenueLoading(false);
    }
  }, [revenuePeriod, revenueMonth, revenueYear, filters.state, filters.executive, filters.leadSource, filters.productId]);

  useEffect(() => {
    fetchRevenue();
  }, [fetchRevenue]);

  const leadSourceData = (stats?.leadSourceSummary ?? []).map((entry) => ({
    name: sourceLabel(entry.source),
    value: entry.count,
    source: entry.source,
  }));
  const quotationStatusData = (charts?.quotationStatus ?? []).map((entry) => ({
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
            {/* Additive: Complaints module — replaces the old Revenue (This
                Month) KPI card (revenue is already covered by the Revenue
                Trend chart below, so this slot now surfaces customer-service
                visibility instead). */}
            <KpiCard
              label="Open Complaints"
              value={stats?.openComplaintsCount ?? 0}
              icon={MessageSquareWarning}
              loading={loading}
              onClick={() => navigate("/complaints?status=OPEN")}
            />
            <KpiCard
              label="Dispatch"
              value={stats?.dispatchCount ?? 0}
              icon={Truck}
              loading={loading}
              onClick={() => navigate("/sales-orders?status=DISPATCHED")}
            />
          </div>

          {/* v2 requirement #13 */}
          <GlobalFiltersBar
            filters={filters}
            onChange={setFilters}
            executiveOptions={executiveOptions}
            productOptions={productOptions}
            currentYear={currentYear}
          />

          {/* v2 requirements #1-5: India Sales Map + Revenue Trend side by
              side (on wide screens) so revenue progression is visible right
              next to where it's happening geographically; they stack on
              narrower screens. */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card className="border-none shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">India Sales Map</CardTitle>
                {filters.state && (
                  <button
                    type="button"
                    onClick={() => setFilters({ ...filters, state: undefined })}
                    className="flex items-center gap-1.5 rounded-md bg-srm-green/10 px-3 py-1.5 text-sm font-medium text-srm-green hover:bg-srm-green/20"
                  >
                    Showing: {filters.state}
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-xs text-muted-foreground">
                  Colored by revenue. Click a state to see its sales orders (with the sales executive on each).
                </p>
                {filteredLoading && salesByState.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Loading...</p>
                ) : (
                  <IndiaSalesMap
                    data={salesByState}
                    onStateClick={(state) => navigate(`/sales-orders?customerState=${encodeURIComponent(state)}`)}
                  />
                )}
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm">
              <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">Revenue Trend</CardTitle>
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
                  <div className="flex h-[300px] items-center justify-center">
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  </div>
                ) : (
                  // The chart itself always renders — the backend always
                  // returns a full set of labeled buckets (12 months, 4
                  // quarters, etc.) even when every bucket is 0 — so the
                  // axes/gridlines are always visible. A "no revenue yet"
                  // note overlays the (flat, empty) chart instead of
                  // replacing it, so this card never looks broken/blank.
                  <div className="relative">
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart
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
                        <defs>
                          <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={SRM_GREEN} stopOpacity={0.35} />
                            <stop offset="100%" stopColor={SRM_GREEN} stopOpacity={0.03} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                        <YAxis
                          tick={{ fontSize: 12 }}
                          tickFormatter={(v) => `₹${Math.round(Number(v) / 1000)}k`}
                          domain={[0, (max: number) => (max > 0 ? max : 100)]}
                        />
                        <Tooltip formatter={(value) => formatINR(Number(value))} />
                        <Area
                          type="monotone"
                          dataKey="value"
                          name="Revenue"
                          stroke={SRM_GREEN}
                          strokeWidth={2}
                          fill="url(#revenueFill)"
                          activeDot={{ r: 5, cursor: "pointer" }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                    {revenueSeries.every((p) => p.value === 0) && (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <p className="rounded-md bg-white/90 px-3 py-1.5 text-sm text-muted-foreground shadow-sm">
                          No revenue in this range yet.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* v2 requirements #6-9: Donut Charts (Lead Source / Quotation Status /
              Production Status / Inventory Status — replaces v1's set, which
              had Lead Status here instead of Quotation Status) */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DonutCard
              title="Lead Sources"
              data={leadSourceData}
              colors={LEAD_SOURCE_COLORS}
              emptyLabel="No leads yet."
              onSliceClick={(name) => {
                const entry = leadSourceData.find((d) => d.name === name);
                if (entry) navigate(`/leads?source=${entry.source}`);
              }}
            />
            <DonutCard
              title="Quotation Status"
              data={quotationStatusData}
              colors={QUOTATION_COLORS}
              emptyLabel="No quotations yet."
              onSliceClick={(name) => navigate(`/quotations?status=${name.toUpperCase().replace(/\s+/g, "_")}`)}
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

          {/* 5 (v1 numbering). Sales Executive Performance — now filtered by
              Global Filters */}
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
                          onClick={() => navigate(`/sales-orders?createdBy=${encodeURIComponent(entry.executive)}`)}
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

          {/* v2 requirement #12: Top Products (Horizontal Bar Chart) */}
          <Card className="border-none shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Top Products</CardTitle>
            </CardHeader>
            <CardContent>
              {topProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sales orders yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(220, topProducts.length * 44)}>
                  <BarChart
                    data={topProducts}
                    layout="vertical"
                    margin={{ left: 16, right: 24 }}
                    onClick={(state) => {
                      const index = state?.activeTooltipIndex;
                      if (index == null) return;
                      const product = topProducts[Number(index)];
                      if (product) navigate(`/sales-orders?productId=${product.productId}`);
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => `₹${Math.round(Number(v) / 1000)}k`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={160} />
                    <Tooltip
                      formatter={(value, name) => (name === "revenue" ? formatINR(Number(value)) : value)}
                    />
                    <Bar dataKey="revenue" name="Revenue" fill={SRM_GREEN} radius={[0, 4, 4, 0]} cursor="pointer" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* 6 & 7 (v1 numbering). Production + Inventory Summary */}
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

          {/* v2 requirement #11: Today's Follow-ups (List) */}
          <Card className="border-none shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Today's Follow-ups</CardTitle>
            </CardHeader>
            <CardContent>
              {todaysFollowUps.length === 0 ? (
                <p className="text-sm text-muted-foreground">No follow-ups scheduled for today.</p>
              ) : (
                <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
                  {todaysFollowUps.map((lead) => (
                    <li key={lead.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/leads/${lead.id}`)}
                        className="flex w-full items-center justify-between rounded-md p-2 text-left text-sm transition-colors hover:bg-slate-50"
                      >
                        <span>
                          <span className="font-medium text-slate-900">{lead.companyName}</span>
                          <span className="text-muted-foreground"> — {lead.contactPerson}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {lead.assignedToName ?? "Unassigned"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

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
