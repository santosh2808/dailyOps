import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRightCircle,
  FileDown,
  Mail,
  Pencil,
  RefreshCw,
  Send,
  Trash2,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import QuotationStatusBadge from "@/components/quotations/QuotationStatusBadge";
import ChangeQuotationStatusDialog from "@/components/quotations/ChangeQuotationStatusDialog";
import DeleteQuotationConfirmDialog from "@/components/quotations/DeleteQuotationConfirmDialog";
import SendQuotationDialog from "@/components/quotations/SendQuotationDialog";
import {
  deleteQuotation,
  getQuotation,
  getQuotationEmailHistory,
  openQuotationPdf,
  updateQuotationStatus,
} from "@/api/quotations";
import { listSalesOrders } from "@/api/sales-orders";
import type { EmailHistoryEntry, Quotation, QuotationStatus } from "@/types";

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

export default function QuotationDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusOpen, setStatusOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [existingSalesOrderId, setExistingSalesOrderId] = useState<string | null>(null);

  const [emailHistory, setEmailHistory] = useState<EmailHistoryEntry[]>([]);
  const [emailHistoryLoading, setEmailHistoryLoading] = useState(true);
  const [pdfError, setPdfError] = useState("");

  const fetchEmailHistory = useCallback(async () => {
    if (!id) return;
    setEmailHistoryLoading(true);
    try {
      setEmailHistory(await getQuotationEmailHistory(id));
    } catch {
      // Non-critical section; leave the previous list in place on failure.
    } finally {
      setEmailHistoryLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchEmailHistory();
  }, [fetchEmailHistory]);

  const fetchQuotation = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const data = await getQuotation(id);
      setQuotation(data);
    } catch {
      setError("Could not load this quotation.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchQuotation();
  }, [fetchQuotation]);

  // A Sales Order can only ever be created once from a given quotation
  // (enforced server-side). Check whether one already exists so we can
  // show "View Sales Order" instead of "Create Sales Order".
  useEffect(() => {
    if (!id || !quotation || quotation.status !== "ACCEPTED") {
      setExistingSalesOrderId(null);
      return;
    }
    let cancelled = false;
    listSalesOrders({ quotationId: id, limit: 1 })
      .then((res) => {
        if (!cancelled) setExistingSalesOrderId(res.data[0]?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setExistingSalesOrderId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [id, quotation]);

  async function handleStatusConfirm(status: QuotationStatus) {
    if (!id) return;
    const result = await updateQuotationStatus(id, status);
    // Required Workflow: Quotation Approved -> Automatically Create Sales
    // Order -> Redirect to Sales Order Details. The backend only returns a
    // `salesOrder` here on the transition into ACCEPTED (see
    // QuotationsService.updateStatus()) — for any other status change this
    // is null and the page just refreshes as before.
    if (result.salesOrder?.id) {
      navigate(`/sales-orders/${result.salesOrder.id}`);
      return;
    }
    await fetchQuotation();
  }

  async function handleDeleteConfirm() {
    if (!id) return;
    await deleteQuotation(id);
    navigate("/quotations");
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="Quotation Details" />
        <main className="flex-1 overflow-y-auto p-6">
          <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate("/quotations")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Quotations
          </Button>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading quotation...</p>
          ) : error || !quotation ? (
            <div className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <span>{error || "Quotation not found."}</span>
              <Button variant="outline" size="sm" onClick={fetchQuotation}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          ) : (
            <div className="mx-auto max-w-4xl space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">{quotation.quotationNumber}</h2>
                  <p className="text-sm text-muted-foreground">
                    {quotation.customer?.companyName ?? quotation.lead?.companyName ?? "Unknown customer"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {/* Lead Management Phase 1 boundary (requirement #14): a
                      lead-sourced quotation (no customerId) can never reach
                      ACCEPTED — see QuotationsService.updateStatus() — so
                      the Sales Order button never applies to one. */}
                  {quotation.status === "ACCEPTED" &&
                    quotation.customerId &&
                    (existingSalesOrderId ? (
                      <Button variant="outline" onClick={() => navigate(`/sales-orders/${existingSalesOrderId}`)}>
                        View Sales Order
                      </Button>
                    ) : (
                      <Button onClick={() => navigate(`/sales-orders/new?quotationId=${quotation.id}`)}>
                        <ArrowRightCircle className="mr-2 h-4 w-4" />
                        Create Sales Order
                      </Button>
                    ))}
                  <Button
                    variant="outline"
                    onClick={() =>
                      openQuotationPdf(quotation.id).catch(() =>
                        setPdfError("Could not load the PDF. Please try again."),
                      )
                    }
                  >
                    <FileDown className="mr-2 h-4 w-4" />
                    View PDF
                  </Button>
                  {(quotation.status === "DRAFT" || quotation.status === "READY") && (
                    <Button variant="outline" onClick={() => setSendOpen(true)}>
                      <Send className="mr-2 h-4 w-4" />
                      Send Quotation
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setStatusOpen(true)}>
                    Change Status
                  </Button>
                  <Button variant="outline" onClick={() => navigate(`/quotations/${quotation.id}/edit`)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                  <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </div>

              {quotation.sentAt && (
                <p className="text-sm text-muted-foreground">
                  Sent to {quotation.sentToEmail} on {formatDate(quotation.sentAt)}
                  {quotation.sentBy ? ` by ${quotation.sentBy}` : ""}.
                </p>
              )}
              {pdfError && <p className="text-sm text-destructive">{pdfError}</p>}

              {/* Lead Management Phase 1 (requirement #12) — always show
                  the next available action so nobody has to wonder. */}
              {quotation.leadId && quotation.status === "SENT" && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Waiting for Customer Response — Customer Acceptance and Sales Order creation are part of Phase 2.
                </div>
              )}
              {quotation.status === "DRAFT" && (
                <div className="rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                  Next step: review the items and pricing below, then use <strong>Send Quotation</strong> once ready.
                </div>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Overview</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Field label="Status" value={<QuotationStatusBadge status={quotation.status} />} />
                  <Field label="Customer" value={quotation.customer?.companyName ?? quotation.lead?.companyName} />
                  <Field
                    label="Contact Person"
                    value={quotation.customer?.contactPerson ?? quotation.lead?.contactPerson}
                  />
                  <Field label="Valid Until" value={formatDate(quotation.validUntil)} />
                  <Field label="Created" value={formatDate(quotation.createdAt)} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Items</CardTitle>
                </CardHeader>
                <CardContent>
                  {quotation.items && quotation.items.length > 0 ? (
                    <div className="space-y-2">
                      {quotation.items.map((item) => (
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
                    <p className="text-sm text-muted-foreground">No items on this quotation.</p>
                  )}

                  <div className="mt-4 grid grid-cols-1 gap-2 rounded-md border bg-slate-50 p-4 text-sm sm:grid-cols-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Subtotal</p>
                      <p className="font-medium text-slate-900">{formatCurrency(quotation.subtotal)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        GST ({quotation.gstPercent}%)
                      </p>
                      <p className="font-medium text-slate-900">{formatCurrency(quotation.gstAmount)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Grand Total</p>
                      <p className="font-semibold text-slate-900">
                        {formatCurrency(quotation.grandTotal)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Notes & Terms</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Field label="Notes" value={quotation.notes} />
                  <Field label="Terms" value={quotation.terms} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Email History</CardTitle>
                </CardHeader>
                <CardContent>
                  {emailHistoryLoading ? (
                    <p className="text-sm text-muted-foreground">Loading email history...</p>
                  ) : emailHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No emails sent yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {emailHistory.map((entry) => (
                        <div key={entry.id} className="flex items-start gap-3 rounded-md border px-3 py-2 text-sm">
                          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-orange" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                              <p className="font-medium text-slate-900">{entry.subject}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(entry.sentAt).toLocaleString()}
                              </p>
                            </div>
                            <p className="text-muted-foreground">
                              To: {entry.recipientEmail}
                              {entry.ccEmails ? ` (cc: ${entry.ccEmails})` : ""}
                            </p>
                            <p
                              className={
                                entry.status === "FAILED"
                                  ? "text-xs text-destructive"
                                  : entry.status === "SIMULATED"
                                    ? "text-xs text-amber-600"
                                    : "text-xs text-emerald-600"
                              }
                            >
                              {entry.status}
                              {entry.sentBy ? ` · by ${entry.sentBy}` : ""}
                            </p>
                            {/* BUG FIX: errorMessage was always captured by
                                MailerService on a FAILED send, but was
                                never actually rendered here — a Failed row
                                gave no way to see why. */}
                            {entry.errorMessage && (
                              <p className="mt-0.5 text-xs text-destructive">{entry.errorMessage}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </div>

      <ChangeQuotationStatusDialog
        open={statusOpen}
        onOpenChange={setStatusOpen}
        quotation={quotation}
        onConfirm={handleStatusConfirm}
      />
      <DeleteQuotationConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        quotation={quotation}
        onConfirm={handleDeleteConfirm}
      />
      <SendQuotationDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        quotation={quotation}
        onSent={() => {
          fetchQuotation();
          fetchEmailHistory();
        }}
      />
    </div>
  );
}
