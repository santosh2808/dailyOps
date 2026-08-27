import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, ExternalLink, RefreshCw, Send } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TaxInvoiceStatusBadge from "@/components/tax-invoices/TaxInvoiceStatusBadge";
import ChangeTaxInvoiceStatusDialog from "@/components/tax-invoices/ChangeTaxInvoiceStatusDialog";
import SendTaxInvoiceDialog from "@/components/tax-invoices/SendTaxInvoiceDialog";
import EmailHistoryCard from "@/components/EmailHistoryCard";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import {
  getTaxInvoice,
  getTaxInvoiceEmailHistory,
  openTaxInvoicePdf,
  updateTaxInvoiceStatus,
} from "@/api/tax-invoices";
import type { EmailHistoryEntry, TaxInvoice, TaxInvoiceStatus } from "@/types";

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

export default function TaxInvoiceDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [invoice, setInvoice] = useState<TaxInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusOpen, setStatusOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [emailHistory, setEmailHistory] = useState<EmailHistoryEntry[]>([]);
  const [emailHistoryLoading, setEmailHistoryLoading] = useState(true);

  const fetchInvoice = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const data = await getTaxInvoice(id);
      setInvoice(data);
    } catch {
      setError("Could not load this tax invoice.");
      toast.error("Could not load this tax invoice.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchInvoice();
  }, [fetchInvoice]);

  useEffect(() => {
    if (!id) return;
    setEmailHistoryLoading(true);
    getTaxInvoiceEmailHistory(id)
      .then(setEmailHistory)
      .catch(() => {})
      .finally(() => setEmailHistoryLoading(false));
  }, [id]);

  async function handleStatusConfirm(status: TaxInvoiceStatus) {
    if (!id) return;
    await updateTaxInvoiceStatus(id, status);
    toast.success("Invoice status updated.");
    await fetchInvoice();
  }

  return (
    <div className="flex h-screen bg-app-grid">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="Tax Invoice Details" />
        <main className="flex-1 overflow-y-auto p-6">
          <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate("/tax-invoices")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Tax Invoices
          </Button>

          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Loading tax invoice...
            </p>
          ) : error || !invoice ? (
            <div className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <span>{error || "Tax invoice not found."}</span>
              <Button variant="outline" size="sm" onClick={fetchInvoice}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          ) : (
            <div className="mx-auto max-w-4xl space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">{invoice.invoiceNumber}</h2>
                  <p className="text-sm text-muted-foreground">
                    {invoice.customer?.companyName ?? "Unknown customer"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setStatusOpen(true)}>
                    Change Status
                  </Button>
                  <Button variant="outline" onClick={() => navigate(`/sales-orders/${invoice.salesOrderId}`)}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    View Sales Order
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      openTaxInvoicePdf(invoice.id).catch(() => {
                        setPdfError("Could not load the PDF. Please try again.");
                        toast.error("Could not load the PDF. Please try again.");
                      })
                    }
                  >
                    <Download className="mr-2 h-4 w-4" />
                    View PDF
                  </Button>
                  {invoice.status !== "CANCELLED" && (
                    <Button onClick={() => setSendOpen(true)}>
                      <Send className="mr-2 h-4 w-4" />
                      {invoice.status === "SENT" ? "Resend to Customer" : "Send to Customer"}
                    </Button>
                  )}
                </div>
              </div>

              {invoice.status === "SENT" && invoice.sentToEmail && (
                <p className="text-xs text-muted-foreground">
                  Sent to {invoice.sentToEmail}
                  {invoice.sentAt ? ` on ${formatDate(invoice.sentAt)}` : ""}
                  {invoice.sentBy ? ` by ${invoice.sentBy}` : ""}.
                </p>
              )}

              {pdfError && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {pdfError}
                </div>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Overview</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Field label="Status" value={<TaxInvoiceStatusBadge status={invoice.status} />} />
                  <Field label="Customer" value={invoice.customer?.companyName} />
                  <Field label="Contact Person" value={invoice.customer?.contactPerson} />
                  <Field label="Sales Order" value={invoice.salesOrder?.salesOrderNumber} />
                  <Field label="Invoice Date" value={formatDate(invoice.invoiceDate)} />
                  <Field label="Buyer's Order No." value={invoice.buyersOrderNo} />
                  <Field label="Dispatched Through" value={invoice.dispatchedThrough} />
                  <Field label="Destination" value={invoice.destination} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Products</CardTitle>
                </CardHeader>
                <CardContent>
                  {invoice.salesOrder?.items && invoice.salesOrder.items.length > 0 ? (
                    <div className="space-y-2">
                      {invoice.salesOrder.items.map((item) => (
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
                            <p className="font-medium text-slate-900">{formatCurrency(item.lineTotal)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No product lines found on the linked sales order.
                    </p>
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-2 rounded-md border bg-slate-50 p-4 text-sm sm:grid-cols-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Subtotal</p>
                      <p className="font-medium text-slate-900">{formatCurrency(invoice.subtotal)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Discount</p>
                      <p className="font-medium text-slate-900">{formatCurrency(invoice.discount)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Tax (GST)</p>
                      <p className="font-medium text-slate-900">{formatCurrency(invoice.tax)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Grand Total</p>
                      <p className="font-semibold text-slate-900">{formatCurrency(invoice.grandTotal)}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Amounts above were copied from the sales order when this invoice was generated.
                    Products are shown live from the linked sales order.
                  </p>
                </CardContent>
              </Card>

              {invoice.termsOfDelivery && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Terms of Delivery</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-line text-sm text-slate-900">{invoice.termsOfDelivery}</p>
                  </CardContent>
                </Card>
              )}

              <EmailHistoryCard loading={emailHistoryLoading} entries={emailHistory} />
            </div>
          )}
        </main>
      </div>

      <ChangeTaxInvoiceStatusDialog
        open={statusOpen}
        onOpenChange={setStatusOpen}
        invoice={invoice}
        onConfirm={handleStatusConfirm}
      />

      <SendTaxInvoiceDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        invoice={invoice}
        onSent={() => {
          fetchInvoice();
          if (id) {
            setEmailHistoryLoading(true);
            getTaxInvoiceEmailHistory(id)
              .then(setEmailHistory)
              .catch(() => {})
              .finally(() => setEmailHistoryLoading(false));
          }
        }}
      />
    </div>
  );
}
