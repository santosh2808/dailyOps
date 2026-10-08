import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ClipboardList,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  MoreVertical,
  Pencil,
  RefreshCw,
  Send,
  Trash2,
  Upload,
  Wallet,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import SalesOrderStatusBadge from "@/components/sales-orders/SalesOrderStatusBadge";
import ChangeSalesOrderStatusDialog from "@/components/sales-orders/ChangeSalesOrderStatusDialog";
import DeleteSalesOrderConfirmDialog from "@/components/sales-orders/DeleteSalesOrderConfirmDialog";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import GenerateProformaInvoiceDialog from "@/components/proforma-invoices/GenerateProformaInvoiceDialog";
import RecordAdvancePaymentDialog from "@/components/proforma-invoices/RecordAdvancePaymentDialog";
import GenerateJeoDialog from "@/components/job-execution-orders/GenerateJeoDialog";
import GenerateTaxInvoiceDialog from "@/components/tax-invoices/GenerateTaxInvoiceDialog";
import SendSalesOrderDialog from "@/components/sales-orders/SendSalesOrderDialog";
import EmailHistoryCard from "@/components/EmailHistoryCard";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/errors";
import { statusLabel } from "@/components/sales-orders/salesOrderOptions";
import {
  deleteSalesOrder,
  deleteSalesOrderPoDocument,
  getSalesOrder,
  getSalesOrderEmailHistory,
  getSalesOrderPoDocumentBlobUrl,
  openSalesOrderPdf,
  updateSalesOrderStatus,
  uploadSalesOrderPoDocument,
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

function formatFileSize(bytes?: number | null) {
  if (bytes == null) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SalesOrderDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

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
  const [sendOpen, setSendOpen] = useState(false);
  const [emailHistory, setEmailHistory] = useState<EmailHistoryEntry[]>([]);
  const [emailHistoryLoading, setEmailHistoryLoading] = useState(true);

  // QA bug fix (SC-008): a cancelled Sales Order is a closed record — none
  // of Generate Proforma Invoice / Generate Tax Invoice / Generate JEO /
  // Record Advance Payment / Edit should still be actionable from here.
  // Viewing an already-generated document (the "View X" buttons above) is
  // unaffected — only the "start something new" / "keep editing" actions
  // are gated. The backend enforces this independently in each service
  // (see e.g. ProformaInvoicesService.create()'s own CANCELLED check) —
  // this is purely to stop staff walking into a rejection instead of
  // seeing a disabled button.
  const isCancelled = salesOrder?.status === "CANCELLED";
  // QA bug fix (SC-009): a Sales Order's item list/totals/addresses may
  // already be reflected in a generated Proforma Invoice, Tax Invoice, or
  // JEO — or already shown to the customer — the moment it moves past
  // Draft, so Edit is only meaningful while it's still a Draft. Stricter
  // than isCancelled above (which still gates the OTHER actions — those
  // stay usable at any non-cancelled status, only Edit itself locks down
  // this early). See SalesOrdersService.update()'s own guard.
  const isEditable = salesOrder?.status === "DRAFT";
  // QA feature (SC-014): a Draft Sales Order is still freely editable and
  // not finalized — Generate Proforma Invoice / Generate Tax Invoice
  // shouldn't be actionable until it's actually confirmed. Same value as
  // isEditable above but named/commented separately since it gates a
  // different pair of actions (kept distinct rather than reusing isEditable
  // directly at each call site, matching isCancelled/isEditable already
  // being separate purpose-named booleans above). The backend enforces this
  // independently too — see ProformaInvoicesService.create()'s own DRAFT
  // check.
  const isDraft = salesOrder?.status === "DRAFT";

  // Customer's Purchase Order document — a scan/photo of the actual PO,
  // separate from customerPoNumber. Allowed at any non-CANCELLED status
  // (unlike Edit above, which is DRAFT-only) — see
  // SalesOrdersService.uploadCustomerPoDocument()'s comment for why.
  const poDocumentInputRef = useRef<HTMLInputElement>(null);
  const [poDocumentUploading, setPoDocumentUploading] = useState(false);
  const [poDocumentDeleteOpen, setPoDocumentDeleteOpen] = useState(false);

  async function handlePoDocumentSelected(file: File | undefined) {
    if (!file || !id) return;
    setPoDocumentUploading(true);
    try {
      const updated = await uploadSalesOrderPoDocument(id, file);
      setSalesOrder(updated);
      toast.success("Purchase Order document uploaded.");
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not upload the Purchase Order document."));
    } finally {
      setPoDocumentUploading(false);
      if (poDocumentInputRef.current) poDocumentInputRef.current.value = "";
    }
  }

  async function handleViewPoDocument() {
    if (!id) return;
    try {
      const url = await getSalesOrderPoDocumentBlobUrl(id);
      window.open(url, "_blank");
      // Revoke after a delay — same convention as openJeoPdf() in
      // api/job-execution-orders.ts (the new tab needs time to load the
      // blob URL before it's invalidated).
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not open the Purchase Order document."));
    }
  }

  const fetchSalesOrder = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const data = await getSalesOrder(id);
      setSalesOrder(data);
    } catch (err) {
      const message = getErrorMessage(err, "Could not load this sales order.");
      setError(message);
      toast.error(message);
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

  const refetchEmailHistory = useCallback(() => {
    if (!id) return;
    setEmailHistoryLoading(true);
    getSalesOrderEmailHistory(id)
      .then(setEmailHistory)
      .catch(() => {})
      .finally(() => setEmailHistoryLoading(false));
  }, [id]);

  useEffect(() => {
    refetchEmailHistory();
  }, [refetchEmailHistory]);

  async function handleGenerateInvoiceConfirm(payload: Omit<ProformaInvoicePayload, "salesOrderId">) {
    if (!id) return;
    const created = await createProformaInvoice({ ...payload, salesOrderId: id });
    toast.success("Proforma Invoice generated.");
    await checkActiveInvoice();
    navigate(`/proforma-invoices/${created.id}`);
  }

  async function handleRecordAdvanceConfirm(advanceReceived: number) {
    if (!activeInvoice) return;
    await updateProformaInvoiceAdvance(activeInvoice.id, { advanceReceived });
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

  async function handleStatusConfirm(status: SalesOrderStatus) {
    if (!id) return;
    await updateSalesOrderStatus(id, status);
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
    <div className="flex min-h-dvh bg-app-grid pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Topbar title="Sales Order Details" />
        <main className="flex-1 p-6">
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
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-semibold text-slate-900">{salesOrder.salesOrderNumber}</h2>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {salesOrder.customer?.companyName ?? "Unknown customer"} · from quotation{" "}
                    <button
                      type="button"
                      className="underline underline-offset-2"
                      onClick={() => navigate(`/quotations/${salesOrder.quotationId}`)}
                    >
                      {salesOrder.quotation?.quotationNumber ?? salesOrder.quotationId}
                    </button>
                  </p>
                  {/* Additive: JEO-based tracking (see SalesOrder.jobExecutionOrders
                      type comment) — staff identify this order by its JEO
                      number day-to-day, so surface it right under the header
                      instead of only reachable via the "View JEO" button. */}
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    JEO:{" "}
                    {salesOrder.jobExecutionOrders?.[0] ? (
                      <button
                        type="button"
                        className="underline underline-offset-2"
                        onClick={() => navigate(`/job-execution-orders/${salesOrder.jobExecutionOrders![0].id}`)}
                      >
                        {salesOrder.jobExecutionOrders[0].jeoNumber}
                      </button>
                    ) : (
                      "Not generated yet"
                    )}
                  </p>
                </div>
                {/* The three "next step" workflow actions (Proforma Invoice,
                    Tax Invoice, JEO — each independently either "View" or
                    "Generate") stay visible since they're the actual reason
                    someone is on this page. Everything else (Record
                    Advance, Change Status, Edit, Delete) moves into one
                    More actions menu — was 7 buttons wrapping unpredictably
                    before. */}
                <div className="flex flex-wrap items-center gap-2">
                  {activeInvoice ? (
                    <Button variant="outline" onClick={() => navigate(`/proforma-invoices/${activeInvoice.id}`)}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      View Proforma Invoice
                    </Button>
                  ) : (
                    <Button
                      onClick={() => setGenerateInvoiceOpen(true)}
                      disabled={isCancelled || isDraft}
                      title={
                        isCancelled
                          ? "This Sales Order is cancelled"
                          : isDraft
                            ? "This Sales Order is still in Draft status — change its status first"
                            : undefined
                      }
                    >
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
                      disabled={isCancelled || isDraft || !activeInvoice || activeInvoice.advanceReceived <= 0}
                      title={
                        isCancelled
                          ? "This Sales Order is cancelled"
                          : isDraft
                            ? "This Sales Order is still in Draft status — change its status first"
                            : !activeInvoice || activeInvoice.advanceReceived <= 0
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
                    <Button
                      onClick={() => setGenerateJeoOpen(true)}
                      disabled={isCancelled}
                      title={isCancelled ? "This Sales Order is cancelled" : undefined}
                    >
                      <ClipboardList className="mr-2 h-4 w-4" />
                      Generate JEO
                    </Button>
                  )}
                  <DropdownMenu
                    trigger={
                      <Button variant="outline" size="icon" aria-label="More actions">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    }
                  >
                    {activeInvoice && (
                      <DropdownMenuItem
                        icon={Wallet}
                        disabled={isCancelled}
                        onSelect={() => setRecordAdvanceOpen(true)}
                      >
                        Record Advance Payment
                      </DropdownMenuItem>
                    )}
                    {/* QA fix: "there is no View PDF option in the Sales
                        Order within the application" — mirrors the
                        Proforma Invoice/Tax Invoice/JEO Details pages' own
                        View PDF item. See openSalesOrderPdf() in
                        api/sales-orders.ts. */}
                    <DropdownMenuItem
                      icon={Download}
                      onSelect={() =>
                        openSalesOrderPdf(salesOrder.id).catch((err) => {
                          toast.error(getErrorMessage(err, "Could not load the PDF. Please try again."));
                        })
                      }
                    >
                      View PDF
                    </DropdownMenuItem>
                    {/* QA bug fix (SC-007): editing a Sales Order never
                        notified the customer — this is the explicit action
                        staff use afterward, any time, not just right after
                        an edit. See SendSalesOrderDialog.tsx. */}
                    <DropdownMenuItem icon={Send} disabled={isCancelled} onSelect={() => setSendOpen(true)}>
                      Send to Customer
                    </DropdownMenuItem>
                    <DropdownMenuItem icon={RefreshCw} onSelect={() => setStatusOpen(true)}>
                      Change Status
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      icon={Pencil}
                      disabled={!isEditable}
                      onSelect={() => navigate(`/sales-orders/${salesOrder.id}/edit`)}
                    >
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem icon={Trash2} destructive onSelect={() => setDeleteOpen(true)}>
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenu>
                </div>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Overview</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Field label="Status" value={<SalesOrderStatusBadge status={salesOrder.status} />} />
                  {/* QA feature (SC-015): "Customer name displayed in the
                      Sales Order should be clickable and linked to the
                      corresponding customer record in the Customers
                      module." Same underline-button-as-link convention as
                      the quotation/JEO links in the header above. Falls
                      back to plain text (Field's own "—" fallback) if this
                      Sales Order somehow has no linked customer. */}
                  <Field
                    label="Customer"
                    value={
                      salesOrder.customer ? (
                        <button
                          type="button"
                          className="underline underline-offset-2"
                          onClick={() => navigate(`/customers/${salesOrder.customer!.id}`)}
                        >
                          {salesOrder.customer.companyName}
                        </button>
                      ) : undefined
                    }
                  />
                  <Field label="Contact Person" value={salesOrder.customer?.contactPerson} />
                  <Field label="Order Date" value={formatDate(salesOrder.orderDate)} />
                  <Field label="Delivery Date" value={formatDate(salesOrder.deliveryDate)} />
                  <Field label="Payment Terms" value={salesOrder.paymentTerms} />
                  {/* QA bug fix (SC-016): this used to also show a live-computed
                      "Advance %" field (Advance Received ÷ Grand Total × 100)
                      here. QA flagged it for the same reason the old manually-
                      typed SalesOrder.advancePercentage field was removed
                      entirely (see create-sales-order.dto.ts) — advance
                      payment information belongs solely to the Record Advance
                      Payment functionality (and the Proforma Invoice it's
                      recorded against), not duplicated here. "Advance
                      Received" alone (a plain fact, not a derived percentage)
                      stays. */}
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

                  <div className="mt-4 grid grid-cols-2 gap-2 rounded-md border bg-slate-50 p-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Subtotal</p>
                      <p className="font-medium text-slate-900">{formatCurrency(salesOrder.subtotal)}</p>
                    </div>
                    {/* QA bug fix ("Quotation -> Sales Order" charge breakdown FAIL):
                        these were already inside grandTotal below (carried
                        forward from the accepted quotation), just never shown
                        as their own line — see the SalesOrder type's comment. */}
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Installation</p>
                      <p className="font-medium text-slate-900">{formatCurrency(salesOrder.installationCharge)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Transportation</p>
                      <p className="font-medium text-slate-900">{formatCurrency(salesOrder.transportationCharge)}</p>
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
                  {salesOrder.noPoAvailable ? (
                    <Field
                      label="Purchase Order Number"
                      value={`No PO available — ${salesOrder.noPoReason || "no reason recorded"}`}
                    />
                  ) : (
                    <Field label="Purchase Order Number" value={salesOrder.customerPoNumber} />
                  )}
                  <Field label="Billing Address" value={salesOrder.billingAddress} />
                  <Field label="Shipping Address" value={salesOrder.shippingAddress} />
                  <Field label="Special Instructions" value={salesOrder.specialInstructions} />
                  <Field label="Remarks" value={salesOrder.remarks} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Purchase Order Document</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {salesOrder.customerPoDocumentOriginalName ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 p-3">
                      <div className="flex items-center gap-2 text-sm">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium text-slate-900">
                            {salesOrder.customerPoDocumentOriginalName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(salesOrder.customerPoDocumentSizeBytes)}
                            {salesOrder.customerPoDocumentUploadedAt &&
                              ` · Uploaded ${formatDate(salesOrder.customerPoDocumentUploadedAt)}`}
                            {salesOrder.customerPoDocumentUploadedBy &&
                              ` by ${salesOrder.customerPoDocumentUploadedBy}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={handleViewPoDocument}>
                          <ExternalLink className="mr-2 h-4 w-4" />
                          View
                        </Button>
                        {!isCancelled && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setPoDocumentDeleteOpen(true)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No Purchase Order document has been uploaded for this Sales Order yet.
                    </p>
                  )}
                  {!isCancelled && (
                    <div>
                      <input
                        ref={poDocumentInputRef}
                        type="file"
                        accept="application/pdf,image/jpeg,image/png"
                        className="hidden"
                        onChange={(e) => handlePoDocumentSelected(e.target.files?.[0])}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={poDocumentUploading}
                        onClick={() => poDocumentInputRef.current?.click()}
                      >
                        {poDocumentUploading ? (
                          <Spinner className="mr-2 h-4 w-4" />
                        ) : (
                          <Upload className="mr-2 h-4 w-4" />
                        )}
                        {salesOrder.customerPoDocumentOriginalName
                          ? "Replace document"
                          : "Upload document"}
                      </Button>
                      <p className="mt-1 text-xs text-muted-foreground">PDF, JPG or PNG, up to 10MB.</p>
                    </div>
                  )}
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
        onConfirm={handleStatusConfirm}
      />
      <DeleteSalesOrderConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        salesOrder={salesOrder}
        onConfirm={handleDeleteConfirm}
      />
      <ConfirmDialog
        open={poDocumentDeleteOpen}
        onOpenChange={setPoDocumentDeleteOpen}
        title="Delete Purchase Order document?"
        description="This removes the uploaded scan/photo of the customer's PO. The Purchase Order Number itself is unaffected — you can upload a replacement document any time."
        confirmLabel="Delete"
        confirmingLabel="Deleting..."
        errorMessage="Could not delete the Purchase Order document."
        onConfirm={async () => {
          if (!id) return;
          const updated = await deleteSalesOrderPoDocument(id);
          setSalesOrder(updated);
          toast.success("Purchase Order document deleted.");
        }}
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
        salesOrderGrandTotal={salesOrder?.grandTotal ?? 0}
        onConfirm={handleRecordAdvanceConfirm}
      />
      <GenerateJeoDialog
        open={generateJeoOpen}
        onOpenChange={setGenerateJeoOpen}
        salesOrder={salesOrder}
        advanceReceived={activeInvoice?.advanceReceived ?? 0}
        onConfirm={handleGenerateJeoConfirm}
      />
      <GenerateTaxInvoiceDialog
        open={generateTaxInvoiceOpen}
        onOpenChange={setGenerateTaxInvoiceOpen}
        salesOrder={salesOrder}
        onConfirm={handleGenerateTaxInvoiceConfirm}
      />
      <SendSalesOrderDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        salesOrder={salesOrder}
        onSent={() => {
          fetchSalesOrder();
          refetchEmailHistory();
        }}
      />
    </div>
  );
}
