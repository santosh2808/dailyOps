import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  RefreshCw,
  Users,
  UserPlus,
  Package,
  FileText,
  ClipboardList,
  Receipt,
  Factory,
  Boxes,
  AlertTriangle,
  PackageX,
  Truck,
  CalendarClock,
  CalendarX2,
  Send,
  CheckCircle2,
  Hourglass,
  Cog,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { sourceLabel } from "@/components/leads/leadOptions";
import { getDashboardStats } from "@/api/dashboard";
import type { DashboardStats } from "@/types";

const summaryCardConfig = [
  { key: "customers", label: "Customers", icon: Users },
  { key: "leads", label: "Leads", icon: UserPlus },
  { key: "products", label: "Products", icon: Package },
  { key: "quotations", label: "Quotations", icon: FileText },
  { key: "salesOrders", label: "Sales Orders", icon: ClipboardList },
  { key: "proformaInvoices", label: "Proforma Invoices", icon: Receipt },
  { key: "jeoPending", label: "JEO Pending", icon: Factory },
  { key: "materialsCount", label: "Materials", icon: Boxes },
  { key: "lowStockCount", label: "Low Stock", icon: AlertTriangle },
  { key: "outOfStockCount", label: "Out Of Stock", icon: PackageX },
  { key: "suppliers", label: "Suppliers", icon: Truck },
  // Additive: Lead follow-up widgets (requirement #9).
  { key: "todaysFollowUpsCount", label: "Today's Follow-ups", icon: CalendarClock },
  { key: "overdueFollowUpsCount", label: "Overdue Follow-ups", icon: CalendarX2 },
  // Additive: Sales Automation Dashboard widgets (requirement #14).
  { key: "upcomingFollowUpsCount", label: "Upcoming Follow-ups", icon: CalendarClock },
  { key: "pendingQuotationsCount", label: "Pending Quotations", icon: Hourglass },
  { key: "sentQuotationsCount", label: "Sent Quotations", icon: Send },
  { key: "acceptedQuotationsCount", label: "Accepted Quotations", icon: CheckCircle2 },
  { key: "ordersAwaitingProductionCount", label: "Orders Awaiting Production", icon: Hourglass },
  { key: "ordersInProductionCount", label: "Orders In Production", icon: Cog },
] as const;

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getDashboardStats();
      setStats(data);
    } catch {
      setError("Failed to load dashboard statistics.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount (and whenever the Dashboard route is (re)entered, since
  // the component remounts each time the user navigates back to it).
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Also refresh when the user returns to this tab/window, so numbers stay
  // current if a Customer or Product was created in another tab.
  useEffect(() => {
    function handleFocus() {
      fetchStats();
    }
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        fetchStats();
      }
    }
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchStats]);

  return (
    <div className="flex h-screen bg-app-grid">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="Dashboard" />
        <main className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <span className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {error}
              </span>
              <Button variant="outline" size="sm" onClick={fetchStats}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {summaryCardConfig.map(({ key, label, icon: Icon }) => (
              <Card key={key} className="border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {label}
                  </CardTitle>
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-orange/10 text-orange">
                    <Icon className="h-4 w-4" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-900">
                    {loading ? (
                      <span className="inline-block h-7 w-12 animate-pulse rounded bg-slate-200" />
                    ) : error ? (
                      "—"
                    ) : (
                      stats?.[key] ?? 0
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="mt-4 border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Lead Source Summary</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : !stats || stats.leadSourceSummary.length === 0 ? (
                <p className="text-sm text-muted-foreground">No leads yet.</p>
              ) : (
                <div className="space-y-2">
                  {(() => {
                    const maxCount = Math.max(...stats.leadSourceSummary.map((s) => s.count), 1);
                    return stats.leadSourceSummary
                      .slice()
                      .sort((a, b) => b.count - a.count)
                      .map((entry) => (
                        <div key={entry.source} className="flex items-center gap-3">
                          <span className="w-32 shrink-0 text-sm text-slate-900">
                            {sourceLabel(entry.source)}
                          </span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-orange"
                              style={{ width: `${(entry.count / maxCount) * 100}%` }}
                            />
                          </div>
                          <span className="w-8 shrink-0 text-right text-sm font-medium text-slate-900">
                            {entry.count}
                          </span>
                        </div>
                      ));
                  })()}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mt-4 border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Sales by Executive</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : !stats || stats.salesByExecutive.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sales orders yet.</p>
              ) : (
                <div className="space-y-2">
                  {(() => {
                    const maxValue = Math.max(
                      ...stats.salesByExecutive.map((s) => s.totalValue),
                      1,
                    );
                    return stats.salesByExecutive
                      .slice()
                      .sort((a, b) => b.totalValue - a.totalValue)
                      .map((entry) => (
                        <div key={entry.executive} className="flex items-center gap-3">
                          <span className="w-32 shrink-0 truncate text-sm text-slate-900">
                            {entry.executive}
                          </span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-orange"
                              style={{ width: `${(entry.totalValue / maxValue) * 100}%` }}
                            />
                          </div>
                          <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                            {entry.orderCount} order{entry.orderCount === 1 ? "" : "s"}
                          </span>
                          <span className="w-28 shrink-0 text-right text-sm font-medium text-slate-900">
                            {new Intl.NumberFormat("en-IN", {
                              style: "currency",
                              currency: "INR",
                              maximumFractionDigits: 0,
                            }).format(entry.totalValue)}
                          </span>
                        </div>
                      ));
                  })()}
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
