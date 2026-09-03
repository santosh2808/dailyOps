import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ClipboardList,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Pencil,
  RefreshCw,
  Trash2,
  Wallet,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SalesOrderStatusBadge from "@/components/sales-orders/SalesOrderStatusBadge";
import ChangeSalesOrderStatusDialog from "@/components/sales-orders/ChangeSalesOrderStatusDialog";
import DeleteSalesOrderConfirmDialog from "@/components/sales-orders/DeleteSalesOrderConfirmDialog";
import GenerateProformaInvoiceDialog from "@/components/proforma-invoices/GenerateProformaInvoiceDialog";
import RecordAdvancePaymentDialog from "@/components/proforma-invoices/RecordAdvancePaymentDialog";
import GenerateJeoDialog from "@/components/job-execution-orders/GenerateJeoDialog";
import GenerateTaxInvoiceDialog from "@/components/tax-invoices/GenerateTaxInvoiceDialog";
import EmailHistoryCard from "@/components/EmailHistoryCard";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { useAuth } from "@/context/AuthContext";
import { statusLabel } from "@/components/sales-orders/salesOrderOptions";
import {
  deleteSalesOrder,
  getSalesOrder,
  getSalesOrderEmailHistory,
  updateSalesOrderStatus,
} from "@/api/sales-orders";
import {
  createProformaInvoice,
  listProformaInvoices,
  updateProformaInvoiceAdvance,
  type ProformaInvoicePayload,
} from "@/api/proforma-invoices";
import {
  createJobExecutionOrder,
  listJobExecutionOrders,
  type JeoPayload,
} from "@/api/job-execution-orders";
import { createTaxInvoice, listTaxInvoices, type TaxInvoicePayload } from "@/api/tax-invoices";
import type { EmailHistoryEntry, ProformaInvoice, SalesOrder, SalesOrderStatus } from "@/types";

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

export default function SalesOrderDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = !!user?.roles?.includes("Administrator");

  const [salesOrder, setSalesOrder] = useState<SalesOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusOpen, setStatusOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [generateInvoiceOpen, setGenerateInvoiceOpen] = useState(false);
  // Full active Proforma Invoice (not just its id) — the dispatch gate and
  // "Generate Tax Invoice" button both need its advanceReceived value.
  const [activeInvoice, setActiveInvoice] = useState<ProformaInvoice | null>(null);
  const [recordAdvanceOpen, setRecordAdvanceOpen] = useState(false);
  const [generateJeoOpen, setGenerateJeoOpen] = useState(false);
  const [activeJeoId, setActiveJeoId] = useState<string | null>(null);
  const [activeTaxInvoiceId, setActiveTaxInvoiceId] = useState<string | null>(null);
  const [generateTaxInvoiceOpen, setGenerateTaxInvoiceOpen] = useState(false);
  const [emailHistory, setEmailHistory] = useState<EmailHistoryEntry[]>([]);
  const [emailHistoryLoading, setEmailHistoryLoading] = useState(true);

  const fetchSalesOrder = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const data = await getSalesOrder(id);
      setSalesOrder(data);
    } catch {
      setError("Could not load this sales order.");
      toast.error("Could not load this sales order.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchSalesOrder();
  }, [fetchSalesOrder]);

  // A Proforma Invoice can be generated more than once over time, but only
  // one non-cancelled invoice may exist per sales order at a time (enforced
  // server-side). Check for one so we can show "View" instead of
  // "Generate" — mirrors the same pattern on QuotationDetails for Sales Orders.
  const checkActiveInvoice = useCallback(async () => {
    if (!id) return;
    try {
      const res = await listProformaInvoices({ salesOrderId: id, limit: 20 });
      const active = res.data.find((inv) => inv.status !== "CANCELLED");
      setActiveInvoice(active ?? null);
    } catch {
      setActiveInvoice(null);
    }
  }, [id]);

  useEffect(() => {
    checkActiveInvoice();
  }, [checkActiveInvoice]);

  // Same "View instead of Generate" pattern for the Tax Invoice — only one
  // active (not CANCELLED) Tax Invoice may exist per sales order at a time.
  const checkActiveTaxInvoice = useCallback(async () => {
    if (!id) return;
    try {
      const res = await listTaxInvoices({ salesOrderId: id, limit: 20 });
      const active = res.data.find((inv) => inv.status !== "CANCELLED");
      setActiveTaxInvoiceId(active?.id ?? null);
    } catch {
      setActiveTaxInvoiceId(null);
    }
  }, [id]);

  useEffect(() => {
    checkActiveTaxInvoice();
  }, [checkActiveTaxInvoice]);

  // Only one active (not yet COMPLETED) JEO may exist per sales order at a
  // time (enforced server-side) — same "View instead of Generate" pattern
  // as the Proforma Invoice check above.
  const checkActiveJeo = useCallback(async () => {
    if (!id) return;
    try {
      const res = await listJobExecutionOrders({ salesOrderId: id, limit: 20 });
      const active = res.data.find((jeo) => jeo.status !== "COMPLETED");
      setActiveJeoId(active?.id ?? null);
    } catch {
      setActiveJeoId(null);
    }
  }, [id]);

  useEffect(() => {
    checkActiveJeo();
  }, [checkActiveJeo]);

  useEffect(() => {
    if (!id) return;
    setEmailHistoryLoading(true);
    getSalesOrderEmailHistory(id)
      .then(setEmailHistory)
      .catch(() => {})
      .finally(() => setEmailHistoryLoading(false));
  }, [id]);

  async function handleGenerateInvoiceConfirm(payload: Omit<ProformaInvoicePayload, "salesOrderId">) {
    if (!id) return;
    const created = await createProformaInvoice({ ...payload, salesOrderId: id });
    toast.success("Proforma Invoice generated.");
    await checkActiveInvoice();
    navigate(`/proforma-invoices/${created.id}`);
  }

  async function handleRecordAdvanceConfirm(advanceReceived: number) {
    if (!activeInvoice) return;
    await updateProformaInvoiceAdvance(activeInvoice.id, advanceReceived);
    toast.success("Advance payment recorded.");
    await checkActiveInvoice();
  }

  async function handleGenerateJeoConfirm(payload: Omit<JeoPayload, "salesOrderId">) {
    if (!id) return;
    const created = await createJobExecutionOrder({ ...payload, salesOrderId: id });
    toast.success("Job Execution Order generated.");
    await checkActiveJeo();
    navigate(`/job-execution-orders/${created.id}`);
  }

  async function handleGenerateTaxInvoiceConfirm(payload: Omit<TaxInvoicePayload, "salesOrderId">) {
    if (!id) return;
    const created = await createTaxInvoice({ ...payload, salesOrderId: id });
    toast.success("Tax Invoice generated. Review it and send it to the customer when ready.");
    await checkActiveTaxInvoice();
    navigate(`/tax-invoices/${created.id}`);
  }

  async function handleStatusConfirm(
    status: SalesOrderStatus,
    dispatchOverrideNote?: string,
    dispatchOverrideApprovedBy?: string,
  ) {
    if (!id) return;
    await updateSalesOrderStatus(id, status, dispatchOverrideNote, dispatchOverrideApprovedBy);
    toast.success(`Sales Order status updated to ${statusLabel(status)}.`);
    await fetchSalesOrder();
  }

  async function handleDeleteConfirm() {
    if (!id) return;
    await deleteSalesOrder(id);
    toast.success("Sales Order deleted.");
    navigate("/sales-orders");
  }

  return (
    <div className="flex h-screen bg-app-grid">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="Sales Order Details" />
        <main className="flex-1 overflow-y-auto p-6">
          <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate("/sales-orders")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Sales Orders
          </Button>

          {loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Spinner /> Loading sales order...
            </div>
          ) : error || !salesOrder ? (
            <div className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <span>{error || "Sales order not found."}</span>
              <Button variant="outline" size="sm" onClick={fetchSalesOrder}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          ) : (
            <div className="mx-auto max-w-4xl space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">{salesOrder.salesOrderNumber}</h2>
                  <p className="text-sm text-muted-foreground">
                    {salesOrder.customer?.companyName ?? "Unknown customer"} · from quotation{" "}
                    <button
                      type="button"
                      className="underline underline-offset-2"
                      onClick={() => navigate(`/quotations/${salesOrder.quotationId}`)}
                    >
                      {salesOrder.quotation?.quotationNumber ?? salesOrder.quotationId}
                    </button>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {activeInvoice ? (
                    <>
                      <Button variant="outline" onClick={() => navigate(`/proforma-invoices/${activeInvoice.id}`)}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        View Proforma Invoice
                      </Button>
                      <Button variant="outline" onClick={() => setRecordAdvanceOpen(true)}>
                        <Wallet className="mr-2 h-4 w-4" />
                        Record Advance Payment
                      </Button>
                    </>
                  ) : (
                    <Button onClick={() => setGenerateInvoiceOpen(true)}>
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                      Generate Proforma Invoice
                    </Button>
                  )}
                  {activeTaxInvoiceId ? (
                    <Button variant="outline" onClick={() => navigate(`/tax-invoices/${activeTaxInvoiceId}`)}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      View Tax Invoice
                    </Button>
                  ) : (
                    <Button
                      onClick={() => setGenerateTaxInvoiceOpen(true)}
                      disabled={!activeInvoice || activeInvoice.advanceReceived <= 0}
                      title={
                        !activeInvoice || activeInvoice.advanceReceived <= 0
                          ? "Record an advance payment on the Proforma Invoice first"
                          : undefined
                      }
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Generate Tax Invoice
                    </Button>
                  )}
                  {activeJeoId ? (
                    <Button variant="outline" onClick={() => navigate(`/job-execution-orders/${activeJeoId}`)}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      View JEO
                    </Button>
                  ) : (
                    <Button onClick={() => setGenerateJeoOpen(true)}>
                      <ClipboardList className="mr-2 h-4 w-4" />
                      Generate JEO
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setStatusOpen(true)}>
                    Change Status
                  </Button>
                  <Button variant="outline" onClick={() => navigate(`/sales-orders/${salesOrder.id}/edit`)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                  <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Overview</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Field label="Status" value={<SalesOrderStatusBadge status={salesOrder.status} />} />
                  <Field label="Customer" value={salesOrder.customer?.companyName} />
                  <Field label="Contact Person" value={salesOrder.customer?.contactPerson} />
                  <Field label="Order Date" value={formatDate(salesOrder.orderDate)} />
                  <Field label="Delivery Date" value={formatDate(salesOrder.deliveryDate)} />
                  <Field label="Payment Terms" value={salesOrder.paymentTerms} />
                  <Field
                    label="Advance %"
                    value={salesOrder.advancePercentage != null ? `${salesOrder.advancePercentage}%` : null}
                  />
                  <Field
                    label="Advance Received"
                    value={activeInvoice ? formatCurrency(activeInvoice.advanceReceived) : null}
                  />
                  <Field label="Created By" value={salesOrder.createdBy} />
                  {salesOrder.dispatchOverrideApprovedBy && (
                    <Field label="Dispatch Approved By" value={salesOrder.dispatchOverrideApprovedBy} />
                  )}
                  {salesOrder.dispatchOverrideNote && (
                    <div className="col-span-2 sm:col-span-4">
                      <Field label="Dispatch Override Note" value={salesOrder.dispatchOverrideNote} />
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Items</CardTitle>
                </CardHeader>
                <CardContent>
                  {salesOrder.items && salesOrder.items.length > 0 ? (
                    <div className="space-y-2">
                      {salesOrder.items.map((item) => (
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
                              {item.discount > 0 && ` − ${formatCurrency(item.discount)}`}
                            </p>
                            <p className="font-medium text-slate-900">
                              {formatCurrency(item.lineTotal)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No items on this sales order.</p>
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-2 rounded-md border bg-slate-50 p-4 text-sm sm:grid-cols-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Subtotal</p>
                      <p className="font-medium text-slate-900">{formatCurrency(salesOrder.subtotal)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Discount</p>
                      <p className="font-medium text-slate-900">{formatCurrency(salesOrder.discount)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Tax (GST)</p>
                      <p className="font-medium text-slate-900">{formatCurrency(salesOrder.tax)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Grand Total</p>
                      <p className="font-semibold text-slate-900">
                        {formatCurrency(salesOrder.grandTotal)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Addresses & Instructions</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Billing Address" value={salesOrder.billingAddress} />
                  <Field label="Shipping Address" value={salesOrder.shippingAddress} />
                  <Field label="Special Instructions" value={salesOrder.specialInstructions} />
                  <Field label="Remarks" value={salesOrder.remarks} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">What's Next</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Material Planning / BOM, Production Tracking, and Dispatch are planned for a future
                    release — the Job Execution Order and its Production Checklist, generated above, are
                    the foundation those will build on without needing a database change.
                  </p>
                </CardContent>
              </Card>

              <EmailHistoryCard loading={emailHistoryLoading} entries={emailHistory} />
            </div>
          )}
        </main>
      </div>

      <ChangeSalesOrderStatusDialog
        open={statusOpen}
        onOpenChange={setStatusOpen}
        salesOrder={salesOrder}
        advanceReceived={activeInvoice?.advanceReceived ?? 0}
        isAdmin={isAdmin}
        onConfirm={handleStatusConfirm}
      />
      <DeleteSalesOrderConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        salesOrder={salesOrder}
        onConfirm={handleDeleteConfirm}
      />
      <GenerateProformaInvoiceDialog
        open={generateInvoiceOpen}
        onOpenChange={setGenerateInvoiceOpen}
        salesOrder={salesOrder}
        onConfirm={handleGenerateInvoiceConfirm}
      />
      <RecordAdvancePaymentDialog
        open={recordAdvanceOpen}
        onOpenChange={setRecordAdvanceOpen}
        invoice={activeInvoice}
        onConfirm={handleRecordAdvanceConfirm}
      />
      <GenerateJeoDialog
        open={generateJeoOpen}
        onOpenChange={setGenerateJeoOpen}
        salesOrder={salesOrder}
        onConfirm={handleGenerateJeoConfirm}
      />
      <GenerateTaxInvoiceDialog
        open={generateTaxInvoiceOpen}
        onOpenChange={setGenerateTaxInvoiceOpen}
        salesOrder={salesOrder}
        onConfirm={handleGenerateTaxInvoiceConfirm}
      />
    </div>
  );
}
