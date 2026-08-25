import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, PlayCircle, RefreshCw, ShieldCheck, Truck } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import JeoStatusBadge from "@/components/job-execution-orders/JeoStatusBadge";
import JeoPriorityBadge from "@/components/job-execution-orders/JeoPriorityBadge";
import ChangeJeoStatusDialog from "@/components/job-execution-orders/ChangeJeoStatusDialog";
import ProductionChecklistCard from "@/components/job-execution-orders/ProductionChecklistCard";
import JeoTimeline from "@/components/job-execution-orders/JeoTimeline";
import EmailHistoryCard from "@/components/EmailHistoryCard";
import {
  getJeoEmailHistory,
  getJeoTimeline,
  getJobExecutionOrder,
  updateJeoStatus,
  updateProductionChecklist,
} from "@/api/job-execution-orders";
import type {
  EmailHistoryEntry,
  JeoStatus,
  JeoTimelineStep,
  JobExecutionOrder,
  ProductionChecklist,
} from "@/types";

type ChecklistKey = keyof Omit<ProductionChecklist, "id" | "jeoId" | "completedAt">;

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm text-slate-900">{value || "—"}</p>
    </div>
  );
}

function formatCurrency(value?: number | null) {
  if (value == null) return null;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString();
}

export default function JobExecutionOrderDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [jeo, setJeo] = useState<JobExecutionOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusOpen, setStatusOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [timelineSteps, setTimelineSteps] = useState<JeoTimelineStep[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [emailHistory, setEmailHistory] = useState<EmailHistoryEntry[]>([]);
  const [emailHistoryLoading, setEmailHistoryLoading] = useState(true);

  const fetchJeo = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const data = await getJobExecutionOrder(id);
      setJeo(data);
    } catch {
      setError("Could not load this job execution order.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Fetched alongside the JEO itself so the Timeline reflects the latest
  // status/checklist state right after a status change or checklist toggle,
  // without needing its own separate refresh trigger.
  const fetchTimeline = useCallback(async () => {
    if (!id) return;
    setTimelineLoading(true);
    try {
      const res = await getJeoTimeline(id);
      setTimelineSteps(res.steps);
    } catch {
      setTimelineSteps([]);
    } finally {
      setTimelineLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchJeo();
    fetchTimeline();
  }, [fetchJeo, fetchTimeline]);

  useEffect(() => {
    if (!id) return;
    setEmailHistoryLoading(true);
    getJeoEmailHistory(id)
      .then(setEmailHistory)
      .catch(() => {})
      .finally(() => setEmailHistoryLoading(false));
  }, [id]);

  async function handleStatusConfirm(status: JeoStatus) {
    if (!id) return;
    await updateJeoStatus(id, status);
    await Promise.all([fetchJeo(), fetchTimeline()]);
  }

  async function handleChecklistToggle(key: ChecklistKey, value: boolean) {
    if (!id) return;
    await updateProductionChecklist(id, { [key]: value });
    await Promise.all([fetchJeo(), fetchTimeline()]);
  }

  // Quick-action shortcuts layered on top of the generic Change Status
  // dialog. Each is visible only at the status it moves forward from, and
  // flips the relevant Production Checklist box(es) together with the
  // status change, per the "Start Production" / "Mark QC Complete" /
  // "Ready For Dispatch" buttons named in scope. Reaching COMPLETED is only
  // done via Change Status, since it isn't one of the named buttons.
  async function handleStartProduction() {
    if (!id) return;
    setActionBusy(true);
    try {
      await updateProductionChecklist(id, { materialIssued: true, assemblyStarted: true });
      await updateJeoStatus(id, "ASSEMBLY_STARTED");
      await Promise.all([fetchJeo(), fetchTimeline()]);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleMarkQcComplete() {
    if (!id) return;
    setActionBusy(true);
    try {
      await updateProductionChecklist(id, { qcPassed: true });
      await updateJeoStatus(id, "QC");
      await Promise.all([fetchJeo(), fetchTimeline()]);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleReadyForDispatch() {
    if (!id) return;
    setActionBusy(true);
    try {
      await updateProductionChecklist(id, { packed: true, readyForDispatch: true });
      await updateJeoStatus(id, "READY_FOR_DISPATCH");
      await Promise.all([fetchJeo(), fetchTimeline()]);
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div className="flex h-screen bg-app-grid">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="Job Execution Order Details" />
        <main className="flex-1 overflow-y-auto p-6">
          <Button
            variant="ghost"
            size="sm"
            className="mb-4"
            onClick={() => navigate("/job-execution-orders")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Job Execution Orders
          </Button>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading job execution order...</p>
          ) : error || !jeo ? (
            <div className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <span>{error || "Job execution order not found."}</span>
              <Button variant="outline" size="sm" onClick={fetchJeo}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          ) : (
            <div className="mx-auto max-w-4xl space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">{jeo.jeoNumber}</h2>
                  <p className="text-sm text-muted-foreground">
                    {jeo.customer?.companyName ?? "Unknown customer"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(jeo.status === "PENDING" || jeo.status === "MATERIAL_READY") && (
                    <Button onClick={handleStartProduction} disabled={actionBusy}>
                      <PlayCircle className="mr-2 h-4 w-4" />
                      Start Production
                    </Button>
                  )}
                  {jeo.status === "ASSEMBLY_STARTED" && (
                    <Button onClick={handleMarkQcComplete} disabled={actionBusy}>
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      Mark QC Complete
                    </Button>
                  )}
                  {jeo.status === "QC" && (
                    <Button onClick={handleReadyForDispatch} disabled={actionBusy}>
                      <Truck className="mr-2 h-4 w-4" />
                      Ready For Dispatch
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setStatusOpen(true)}>
                    Change Status
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/sales-orders/${jeo.salesOrderId}`)}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    View Sales Order
                  </Button>
                </div>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Overview</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Field label="Status" value={<JeoStatusBadge status={jeo.status} />} />
                  <Field label="Priority" value={<JeoPriorityBadge priority={jeo.priority} />} />
                  <Field label="Customer" value={jeo.customer?.companyName} />
                  <Field label="Contact Person" value={jeo.customer?.contactPerson} />
                  <Field label="Sales Order" value={jeo.salesOrder?.salesOrderNumber} />
                  <Field label="Quotation" value={jeo.quotation?.quotationNumber} />
                  <Field label="Delivery Date" value={formatDate(jeo.deliveryDate)} />
                  <Field label="Assigned To" value={jeo.assignedTo} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Products</CardTitle>
                </CardHeader>
                <CardContent>
                  {jeo.salesOrder?.items && jeo.salesOrder.items.length > 0 ? (
                    <div className="space-y-2">
                      {jeo.salesOrder.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                        >
                          <div>
                            <p className="font-medium text-slate-900">
                              {item.product?.name ?? "Unknown product"}
                            </p>
                            {item.description && (
                              <p className="text-xs text-muted-foreground">{item.description}</p>
                            )}
                          </div>
                          <div className="text-right text-muted-foreground">
                            <p>
                              Qty: {item.quantity} × {formatCurrency(item.unitPrice)}
                            </p>
                            <p className="font-medium text-slate-900">
                              {formatCurrency(item.lineTotal)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No product lines found on the linked sales order.
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Products are shown live from the linked sales order — this JEO doesn't duplicate
                    them into its own record.
                  </p>
                </CardContent>
              </Card>

              <ProductionChecklistCard
                checklist={jeo.checklist}
                disabled={actionBusy}
                onToggle={handleChecklistToggle}
              />

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Remarks</CardTitle>
                </CardHeader>
                <CardContent>
                  <Field label="Remarks" value={jeo.remarks} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Timeline</CardTitle>
                </CardHeader>
                <CardContent>
                  <JeoTimeline steps={timelineSteps} loading={timelineLoading} />
                </CardContent>
              </Card>

              <EmailHistoryCard loading={emailHistoryLoading} entries={emailHistory} />
            </div>
          )}
        </main>
      </div>

      <ChangeJeoStatusDialog
        open={statusOpen}
        onOpenChange={setStatusOpen}
        jeo={jeo}
        onConfirm={handleStatusConfirm}
      />
    </div>
  );
}
