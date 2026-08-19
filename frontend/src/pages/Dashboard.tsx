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
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="flex h-screen bg-slate-50">
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
        </main>
      </div>
    </div>
  );
}
