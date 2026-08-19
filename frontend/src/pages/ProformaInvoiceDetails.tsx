import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, ExternalLink, RefreshCw } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ProformaInvoiceStatusBadge from "@/components/proforma-invoices/ProformaInvoiceStatusBadge";
import ChangeProformaInvoiceStatusDialog from "@/components/proforma-invoices/ChangeProformaInvoiceStatusDialog";
import { getProformaInvoice, updateProformaInvoiceStatus } from "@/api/proforma-invoices";
import type { ProformaInvoice, ProformaInvoiceStatus } from "@/types";

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

export default function ProformaInvoiceDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [invoice, setInvoice] = useState<ProformaInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusOpen, setStatusOpen] = useState(false);
  const [pdfNotice, setPdfNotice] = useState(false);

  const fetchInvoice = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const data = await getProformaInvoice(id);
      setInvoice(data);
    } catch {
      setError("Could not load this proforma invoice.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchInvoice();
  }, [fetchInvoice]);

  async function handleStatusConfirm(status: ProformaInvoiceStatus) {
    if (!id) return;
    await updateProformaInvoiceStatus(id, status);
    await fetchInvoice();
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="Proforma Invoice Details" />
        <main className="flex-1 overflow-y-auto p-6">
          <Button
            variant="ghost"
            size="sm"
            className="mb-4"
            onClick={() => navigate("/proforma-invoices")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Proforma Invoices
          </Button>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading proforma invoice...</p>
          ) : error || !invoice ? (
            <div className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <span>{error || "Proforma invoice not found."}</span>
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
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/sales-orders/${invoice.salesOrderId}`)}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    View Sales Order
                  </Button>
                  <Button variant="outline" onClick={() => setPdfNotice(true)}>
                    <Download className="mr-2 h-4 w-4" />
                    Download PDF
                  </Button>
                </div>
              </div>

              {pdfNotice && (
                <div className="rounded-md border border-orange/30 bg-orange/5 px-4 py-3 text-sm text-slate-700">
                  PDF generation isn't implemented yet — it's planned for a future release using Smart
                  Rotamac's existing Proforma Invoice layout. This invoice's data (customer, items,
                  amounts, bank details) is already structured to feed that layout once it's built.
                </div>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Overview</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Field label="Status" value={<ProformaInvoiceStatusBadge status={invoice.status} />} />
                  <Field label="Customer" value={invoice.customer?.companyName} />
                  <Field label="Contact Person" value={invoice.customer?.contactPerson} />
                  <Field label="Sales Order" value={invoice.salesOrder?.salesOrderNumber} />
                  <Field label="Invoice Date" value={formatDate(invoice.invoiceDate)} />
                  <Field label="Valid Until" value={formatDate(invoice.validUntil)} />
                  <Field label="Payment Terms" value={invoice.paymentTerms} />
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

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Bank Details & Notes</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Bank Name" value={invoice.bankName} />
                  <Field label="Account Number" value={invoice.accountNumber} />
                  <Field label="IFSC Code" value={invoice.ifscCode} />
                  <Field label="Branch" value={invoice.branch} />
                  <div className="sm:col-span-2">
                    <Field label="Notes" value={invoice.notes} />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </div>

      <ChangeProformaInvoiceStatusDialog
        open={statusOpen}
        onOpenChange={setStatusOpen}
        invoice={invoice}
        onConfirm={handleStatusConfirm}
      />
    </div>
  );
}
