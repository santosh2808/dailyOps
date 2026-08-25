import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ClipboardList, ExternalLink, FileSpreadsheet, FileText, RefreshCw } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import QuotationStatusBadge from "@/components/quotations/QuotationStatusBadge";
import SalesOrderStatusBadge from "@/components/sales-orders/SalesOrderStatusBadge";
import GenerateProformaInvoiceDialog from "@/components/proforma-invoices/GenerateProformaInvoiceDialog";
import GenerateJeoDialog from "@/components/job-execution-orders/GenerateJeoDialog";
import { getCustomer } from "@/api/customers";
import { listQuotations, updateQuotationStatus, type QuotationApprovalErrorBody } from "@/api/quotations";
import { listSalesOrders } from "@/api/sales-orders";
import {
  createProformaInvoice,
  listProformaInvoices,
  type ProformaInvoicePayload,
} from "@/api/proforma-invoices";
import { createJobExecutionOrder, listJobExecutionOrders, type JeoPayload } from "@/api/job-execution-orders";
import type { Customer, Quotation, SalesOrder } from "@/types";

// BUG FIX: after a Lead is marked WON and converted to a Customer, the
// workflow used to just dead-end (the Lead page showed "View Customer" ->
// the Customers list, and the lead's own Quotation could never be Accepted
// because it still had no customerId — see the fix in
// LeadsService.convertToCustomer()). This page is the actual "what happens
// next" destination: it shows every Quotation for this customer and, once
// one is Accepted, the Sales Order / Proforma Invoice / Job Execution
// Order actions that follow from it — reusing the exact same
// dialogs/endpoints already used from Sales Order Details, so nothing
// about those existing flows changes.

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm text-slate-900">{value || "—"}</p>
    </div>
  );
}

export default function CustomerDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [activeInvoiceId, setActiveInvoiceId] = useState<string | null>(null);
  const [activeJeoId, setActiveJeoId] = useState<string | null>(null);
  const [generateInvoiceOpen, setGenerateInvoiceOpen] = useState(false);
  const [generateJeoOpen, setGenerateJeoOpen] = useState(false);

  const [generatingSalesOrder, setGeneratingSalesOrder] = useState(false);
  const [salesOrderError, setSalesOrderError] = useState<{ message: string; quotationId?: string } | null>(
    null,
  );

  const fetchAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const [customerData, quotationsRes, salesOrdersRes] = await Promise.all([
        getCustomer(id),
        listQuotations({ customerId: id, limit: 50, sortBy: "createdAt", sortOrder: "desc" }),
        listSalesOrders({ customerId: id, limit: 50 }),
      ]);
      setCustomer(customerData);
      setQuotations(quotationsRes.data);
      setSalesOrders(salesOrdersRes.data);
    } catch {
      setError("Could not load this customer.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // The Quotation that already carries this customer's Sales Order (if
  // any), and that Sales Order itself — mirrors SalesOrderDetails.tsx's own
  // "does one already exist" checks, just entered from the Customer side.
  const acceptedQuotation = quotations.find((q) => q.status === "ACCEPTED");
  const salesOrder = acceptedQuotation
    ? salesOrders.find((so) => so.quotationId === acceptedQuotation.id)
    : undefined;
  // The most recent quotation still awaiting a decision — what "Generate
  // Sales Order" acts on when nothing has been Accepted yet.
  const pendingQuotation = quotations.find((q) => !["ACCEPTED", "REJECTED", "EXPIRED"].includes(q.status));

  const checkActiveInvoice = useCallback(async () => {
    if (!salesOrder) {
      setActiveInvoiceId(null);
      return;
    }
    try {
      const res = await listProformaInvoices({ salesOrderId: salesOrder.id, limit: 20 });
      const active = res.data.find((inv) => inv.status !== "CANCELLED");
      setActiveInvoiceId(active?.id ?? null);
    } catch {
      setActiveInvoiceId(null);
    }
  }, [salesOrder]);

  const checkActiveJeo = useCallback(async () => {
    if (!salesOrder) {
      setActiveJeoId(null);
      return;
    }
    try {
      const res = await listJobExecutionOrders({ salesOrderId: salesOrder.id, limit: 20 });
      const active = res.data.find((jeo) => jeo.status !== "COMPLETED");
      setActiveJeoId(active?.id ?? null);
    } catch {
      setActiveJeoId(null);
    }
  }, [salesOrder]);

  useEffect(() => {
    checkActiveInvoice();
  }, [checkActiveInvoice]);

  useEffect(() => {
    checkActiveJeo();
  }, [checkActiveJeo]);

  // "Generate Sales Order" — Accepting the quotation reuses the existing
  // PATCH .../status endpoint, which already (a) refuses the transition if
  // Price Validation / Approval Matrix blocks it, returning the same
  // structured error QuotationDetails already knows how to explain, and
  // (b) auto-creates the Sales Order (and best-effort the Proforma Invoice
  // / JEO) the moment it succeeds — exactly the same cascade every other
  // Accepted quotation already goes through. Nothing new is introduced
  // server-side; this just triggers the same existing action from here.
  async function handleGenerateSalesOrder(quotationId: string) {
    setGeneratingSalesOrder(true);
    setSalesOrderError(null);
    try {
      const result = await updateQuotationStatus(quotationId, "ACCEPTED");
      if (result.salesOrder?.id) {
        navigate(`/sales-orders/${result.salesOrder.id}`);
        return;
      }
      await fetchAll();
    } catch (err: any) {
      const body: QuotationApprovalErrorBody | { message?: string } | undefined = err?.response?.data;
      if (body && "code" in body && (body.code === "PRICE_BELOW_MINIMUM" || body.code === "APPROVAL_REQUIRED")) {
        setSalesOrderError({ message: body.message, quotationId });
      } else {
        setSalesOrderError({
          message: body?.message || "Could not generate the sales order. Please try again.",
        });
      }
    } finally {
      setGeneratingSalesOrder(false);
    }
  }

  async function handleGenerateInvoiceConfirm(payload: Omit<ProformaInvoicePayload, "salesOrderId">) {
    if (!salesOrder) return;
    const created = await createProformaInvoice({ ...payload, salesOrderId: salesOrder.id });
    await checkActiveInvoice();
    navigate(`/proforma-invoices/${created.id}`);
  }

  async function handleGenerateJeoConfirm(payload: Omit<JeoPayload, "salesOrderId">) {
    if (!salesOrder) return;
    const created = await createJobExecutionOrder({ ...payload, salesOrderId: salesOrder.id });
    await checkActiveJeo();
    navigate(`/job-execution-orders/${created.id}`);
  }

  return (
    <div className="flex h-screen bg-app-grid">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="Customer Details" />
        <main className="flex-1 overflow-y-auto p-6">
          <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate("/customers")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Customers
          </Button>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading customer...</p>
          ) : error || !customer ? (
            <div className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <span>{error || "Customer not found."}</span>
              <Button variant="outline" size="sm" onClick={fetchAll}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          ) : (
            <div className="mx-auto max-w-4xl space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">{customer.companyName}</h2>
                <p className="text-sm text-muted-foreground">{customer.contactPerson}</p>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Overview</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Field label="Phone" value={customer.phone} />
                  <Field label="Email" value={customer.email} />
                  <Field label="GST Number" value={customer.gstNumber} />
                  <Field label="Status" value={customer.isActive ? "Active" : "Inactive"} />
                </CardContent>
              </Card>

              {/* Requirement: Actions section shown once the customer
                  exists — Generate Sales Order / Proforma Invoice / Job
                  Execution Order. */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-2 rounded-md border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900">Sales Order</p>
                      <p className="text-sm text-muted-foreground">
                        {salesOrder
                          ? `${salesOrder.salesOrderNumber} — generated from ${acceptedQuotation?.quotationNumber}.`
                          : acceptedQuotation
                            ? `Quotation ${acceptedQuotation.quotationNumber} is Accepted but has no Sales Order yet.`
                            : pendingQuotation
                              ? `Accept Quotation ${pendingQuotation.quotationNumber} to generate a Sales Order.`
                              : "No quotation available yet for this customer."}
                      </p>
                    </div>
                    {salesOrder ? (
                      <Button variant="outline" onClick={() => navigate(`/sales-orders/${salesOrder.id}`)}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        View Sales Order
                      </Button>
                    ) : acceptedQuotation ? (
                      <Button onClick={() => navigate(`/sales-orders/new?quotationId=${acceptedQuotation.id}`)}>
                        <FileText className="mr-2 h-4 w-4" />
                        Generate Sales Order
                      </Button>
                    ) : pendingQuotation ? (
                      <Button
                        onClick={() => handleGenerateSalesOrder(pendingQuotation.id)}
                        disabled={generatingSalesOrder}
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        {generatingSalesOrder ? "Generating..." : "Generate Sales Order"}
                      </Button>
                    ) : (
                      <Button disabled variant="outline">
                        Generate Sales Order
                      </Button>
                    )}
                  </div>
                  {salesOrderError && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                      <p>{salesOrderError.message}</p>
                      {salesOrderError.quotationId && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={() => navigate(`/quotations/${salesOrderError.quotationId}`)}
                        >
                          Review Quotation
                        </Button>
                      )}
                    </div>
                  )}

                  <div className="flex flex-col gap-2 rounded-md border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900">Proforma Invoice</p>
                      <p className="text-sm text-muted-foreground">
                        {salesOrder ? "Pre-filled from the Sales Order above." : "Generate a Sales Order first."}
                      </p>
                    </div>
                    {activeInvoiceId ? (
                      <Button variant="outline" onClick={() => navigate(`/proforma-invoices/${activeInvoiceId}`)}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        View Proforma Invoice
                      </Button>
                    ) : (
                      <Button onClick={() => setGenerateInvoiceOpen(true)} disabled={!salesOrder}>
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        Generate Proforma Invoice
                      </Button>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 rounded-md border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900">Job Execution Order</p>
                      <p className="text-sm text-muted-foreground">
                        {salesOrder ? "Pre-filled from the Sales Order above." : "Generate a Sales Order first."}
                      </p>
                    </div>
                    {activeJeoId ? (
                      <Button variant="outline" onClick={() => navigate(`/job-execution-orders/${activeJeoId}`)}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        View JEO
                      </Button>
                    ) : (
                      <Button onClick={() => setGenerateJeoOpen(true)} disabled={!salesOrder}>
                        <ClipboardList className="mr-2 h-4 w-4" />
                        Generate Job Execution Order
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Quotations</CardTitle>
                </CardHeader>
                <CardContent>
                  {quotations.length > 0 ? (
                    <div className="space-y-2">
                      {quotations.map((q) => (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => navigate(`/quotations/${q.id}`)}
                          className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-slate-50"
                        >
                          <span className="font-medium text-slate-900">{q.quotationNumber}</span>
                          <QuotationStatusBadge status={q.status} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No quotations linked to this customer yet.</p>
                  )}
                </CardContent>
              </Card>

              {salesOrders.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Sales Orders</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {salesOrders.map((so) => (
                      <button
                        key={so.id}
                        type="button"
                        onClick={() => navigate(`/sales-orders/${so.id}`)}
                        className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-slate-50"
                      >
                        <span className="font-medium text-slate-900">{so.salesOrderNumber}</span>
                        <SalesOrderStatusBadge status={so.status} />
                      </button>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </main>
      </div>

      <GenerateProformaInvoiceDialog
        open={generateInvoiceOpen}
        onOpenChange={setGenerateInvoiceOpen}
        salesOrder={salesOrder ?? null}
        onConfirm={handleGenerateInvoiceConfirm}
      />
      <GenerateJeoDialog
        open={generateJeoOpen}
        onOpenChange={setGenerateJeoOpen}
        salesOrder={salesOrder ?? null}
        onConfirm={handleGenerateJeoConfirm}
      />
    </div>
  );
}
