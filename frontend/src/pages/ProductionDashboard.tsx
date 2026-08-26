import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  Boxes,
  CheckCircle2,
  Clock,
  PackageCheck,
  ShieldCheck,
  Truck,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { STATUS_OPTIONS } from "@/components/job-execution-orders/jeoOptions";
import { getProductionDashboard, updateJeoStatus } from "@/api/job-execution-orders";
import type { JeoDashboardResponse, JeoStatus } from "@/types";

type DashboardCountKey = keyof Omit<JeoDashboardResponse, "activeOrders">;

// Card labels are the exact wording named in scope ("Pending Production",
// not "Pending") — kept local to this page since jeoOptions.ts's
// STATUS_OPTIONS labels are shared with the Change Status dialog / filters
// elsewhere and use shorter wording. `key` matches the flat response field
// from GET /api/v1/job-execution-orders/production-dashboard.
const CARD_CONFIG: { key: DashboardCountKey; label: string; icon: typeof Clock }[] = [
  { key: "pending", label: "Pending Production", icon: Clock },
  { key: "materialReady", label: "Material Ready", icon: Boxes },
  { key: "assemblyStarted", label: "Assembly Started", icon: PackageCheck },
  { key: "qc", label: "QC", icon: ShieldCheck },
  { key: "readyForDispatch", label: "Ready For Dispatch", icon: Truck },
  { key: "completed", label: "Completed", icon: CheckCircle2 },
];

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

export default function ProductionDashboard() {
  const navigate = useNavigate();

  const [data, setData] = useState<JeoDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getProductionDashboard();
      setData(res);
    } catch {
      setError("Failed to load the production dashboard.");
      toast.error("Failed to load the production dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Change status directly from the dashboard table. The dashboard's counts
  // and the table itself both come from the same endpoint, so re-fetching
  // it after a successful update refreshes both immediately — no separate
  // "counts" state to keep in sync by hand.
  async function handleStatusChange(id: string, status: JeoStatus) {
    setUpdatingId(id);
    try {
      await updateJeoStatus(id, status);
      toast.success("Job execution order status updated.");
      await fetchDashboard();
    } catch {
      setError("Could not update that JEO's status. Please try again.");
      toast.error("Could not update that JEO's status.");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="flex h-screen bg-app-grid">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="Production Dashboard" />
        <main className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <span className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {error}
              </span>
              <Button variant="outline" size="sm" onClick={fetchDashboard}>
                Retry
              </Button>
            </div>
          )}

          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {CARD_CONFIG.map(({ key, label, icon: Icon }) => (
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
                    ) : (
                      data?.[key] ?? 0
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Active Job Execution Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>JEO Number</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Sales Order</TableHead>
                    <TableHead>Products</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Assigned Production Manager</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Delivery Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                        <span className="inline-flex items-center gap-2">
                          <Spinner /> Loading active job execution orders...
                        </span>
                      </TableCell>
                    </TableRow>
                  ) : !data || data.activeOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                        No active job execution orders.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.activeOrders.map((jeo) => {
                      const items = jeo.salesOrder?.items ?? [];
                      const products = items.length
                        ? items.map((item) => item.product?.name ?? "Unknown product").join(", ")
                        : "—";
                      const quantity = items.reduce((sum, item) => sum + item.quantity, 0);

                      return (
                        <TableRow
                          key={jeo.id}
                          className="cursor-pointer"
                          onClick={() => navigate(`/job-execution-orders/${jeo.id}`)}
                        >
                          <TableCell className="font-medium text-slate-900">{jeo.jeoNumber}</TableCell>
                          <TableCell>{jeo.customer?.companyName ?? "—"}</TableCell>
                          <TableCell>{jeo.salesOrder?.salesOrderNumber ?? "—"}</TableCell>
                          <TableCell className="max-w-[220px] truncate" title={products}>
                            {products}
                          </TableCell>
                          <TableCell>{quantity || "—"}</TableCell>
                          <TableCell>{jeo.assignedTo ?? "—"}</TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-2">
                              <Select
                                className="w-44"
                                value={jeo.status}
                                disabled={updatingId === jeo.id}
                                onChange={(e) => handleStatusChange(jeo.id, e.target.value as JeoStatus)}
                              >
                                {STATUS_OPTIONS.map((s) => (
                                  <option key={s.value} value={s.value}>
                                    {s.label}
                                  </option>
                                ))}
                              </Select>
                              {updatingId === jeo.id && <Spinner className="h-4 w-4" />}
                            </div>
                          </TableCell>
                          <TableCell>{formatDate(jeo.deliveryDate)}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
