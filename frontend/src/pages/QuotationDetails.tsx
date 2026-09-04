import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRightCircle,
  CheckCircle2,
  Eye,
  FileDown,
  Mail,
  Pencil,
  RefreshCw,
  Send,
  Trash2,
  UserCheck,
  XCircle,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import QuotationStatusBadge from "@/components/quotations/QuotationStatusBadge";
import ChangeQuotationStatusDialog from "@/components/quotations/ChangeQuotationStatusDialog";
import DeleteQuotationConfirmDialog from "@/components/quotations/DeleteQuotationConfirmDialog";
import SendQuotationDialog from "@/components/quotations/SendQuotationDialog";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import {
  deleteQuotation,
  getQuotation,
  getQuotationEmailHistory,
  getQuotationHistory,
  openQuotationPdf,
  updateQuotationStatus,
} from "@/api/quotations";
import { listSalesOrders } from "@/api/sales-orders";
import { hangingStructureLabel } from "@/components/job-execution-orders/jeoOptions";
import type { EmailHistoryEntry, Quotation, QuotationHistoryEntry, QuotationStatus } from "@/types";

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

function formatDateTime(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString();
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

  // Quotation History timeline (Customer Quotation Acceptance workflow,
  // requirement #10/#14).
  const [quotationHistory, setQuotationHistory] = useState<QuotationHistoryEntry[]>([]);
  const [quotationHistoryLoading, setQuotationHistoryLoading] = useState(true);

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

  const fetchQuotationHistory = useCallback(async () => {
    if (!id) return;
    setQuotationHistoryLoading(true);
    try {
      setQuotationHistory(await getQuotationHistory(id));
    } catch {
      // Non-critical section; leave the previous list in place on failure.
    } finally {
      setQuotationHistoryLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchEmailHistory();
    fetchQuotationHistory();
  }, [fetchEmailHistory, fetchQuotationHistory]);

  const fetchQuotation = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const data = await getQuotation(id);
      setQuotation(data);
    } catch {
      setError("Could not load this quotation.");
      toast.error("Could not load this quotation.");
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
      toast.success("Quotation approved. Sales Order created.");
      navigate(`/sales-orders/${result.salesOrder.id}`);
      return;
    }
    toast.success("Quotation status updated.");
    await fetchQuotation();
    await fetchQuotationHistory();
  }

  async function handleDeleteConfirm() {
    if (!id) return;
    await deleteQuotation(id);
    toast.success("Quotation deleted.");
    navigate("/quotations");
  }

  return (
    <div className="flex h-screen bg-app-grid">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="Quotation Details" />
        <main className="flex-1 overflow-y-auto p-6">
          <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate("/quotations")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Quotations
          </Button>

          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Loading quotation...
            </p>
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
                      openQuotationPdf(quotation.id).catch(() => {
                        setPdfError("Could not load the PDF. Please try again.");
                        toast.error("Could not load the PDF. Please try again.");
                      })
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
                  {/* Customer Quotation Acceptance workflow — "Resend
                      Quotation" once already sent (SENT/VIEWED). Covers a
                      customer who lost the email, and fixing/retrying after
                      an Email Template edit (e.g. the QUOTATION template
                      missing {{quotationLink}} on an older database). The
                      backend already allows this for any non-terminal
                      status — see QuotationsService.sendQuotation() — this
                      just surfaces it once the quotation is no longer
                      Draft/Ready. */}
                  {(quotation.status === "SENT" || quotation.status === "VIEWED") && (
                    <Button variant="outline" onClick={() => setSendOpen(true)}>
                      <Send className="mr-2 h-4 w-4" />
                      Resend Quotation
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

              {/* Lead Management Phase 1 (requirement #12), extended by the
                  Customer Quotation Acceptance workflow (requirement #15) —
                  always show the next available action so nobody has to
                  wonder. */}
              {quotation.status === "SENT" && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Waiting for Customer Response — the customer has been emailed a secure link to
                  view, accept, or reject this quotation.
                </div>
              )}
              {quotation.status === "VIEWED" && (
                <div className="flex items-center gap-2 rounded-md border border-orange/30 bg-orange/5 px-4 py-3 text-sm text-orange">
                  <Eye className="h-4 w-4 flex-shrink-0" />
                  The customer has viewed this quotation and has not yet made a decision.
                </div>
              )}
              {quotation.status === "ACCEPTED" && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                    ✓ Quotation Accepted
                    {quotation.acceptedByName ? ` by ${quotation.acceptedByName}` : ""}
                    {quotation.acceptedAt ? ` on ${formatDateTime(quotation.acceptedAt)}` : ""}
                  </span>
                  {/* Requirement #9/#15 — Do NOT auto-convert to Customer;
                      just point at the existing Lead Details "Convert to
                      Customer" action (already surfaces automatically once
                      LeadsService.recordQuotationAccepted() moves the lead
                      to WON — see leadOptions.ts). */}
                  {quotation.leadId && !quotation.customerId && (
                    <Button size="sm" variant="outline" onClick={() => navigate(`/leads/${quotation.leadId}`)}>
                      <UserCheck className="mr-2 h-4 w-4" />
                      Convert to Customer
                    </Button>
                  )}
                </div>
              )}
              {quotation.status === "REJECTED" && (
                <div className="rounded-md border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700">
                  <span className="flex items-center gap-2 font-medium text-slate-900">
                    <XCircle className="h-4 w-4 flex-shrink-0" />
                    Quotation Rejected by Customer
                  </span>
                  {quotation.rejectionReason && <p className="mt-1">Reason: {quotation.rejectionReason}</p>}
                  {quotation.rejectionComment && <p className="mt-0.5">"{quotation.rejectionComment}"</p>}
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
                      {quotation.items.map((item) => {
                        const hasColor = !!item.color?.trim() || (item.colorCharge ?? 0) > 0;
                        const hasStructure = !!item.hangingStructureType || (item.hangingStructureCharge ?? 0) > 0;
                        return (
                          <div key={item.id} className="rounded-md border px-3 py-2 text-sm">
                            <div className="flex items-center justify-between">
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
                            {(hasColor || hasStructure) && (
                              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t pt-2 text-xs text-muted-foreground">
                                {hasColor && (
                                  <span>
                                    Color: <span className="text-slate-700">{item.color?.trim() || "Custom"}</span>
                                    {(item.colorCharge ?? 0) > 0 && ` (+${formatCurrency(item.colorCharge)})`}
                                  </span>
                                )}
                                {hasStructure && (
                                  <span>
                                    Hanging Structure:{" "}
                                    <span className="text-slate-700">
                                      {item.hangingStructureType ? hangingStructureLabel(item.hangingStructureType) : "Custom"}
                                      {item.hangingStructureType === "PIPE_TRUSS" && item.pipeLength?.trim()
                                        ? `, Pipe Length: ${item.pipeLength.trim()}`
                                        : ""}
                                    </span>
                                    {(item.hangingStructureCharge ?? 0) > 0 &&
                                      ` (+${formatCurrency(item.hangingStructureCharge)})`}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No items on this quotation.</p>
                  )}

                  <div className="mt-4 grid grid-cols-1 gap-2 rounded-md border bg-slate-50 p-4 text-sm sm:grid-cols-5">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Subtotal</p>
                      <p className="font-medium text-slate-900">{formatCurrency(quotation.subtotal)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Installation</p>
                      <p className="font-medium text-slate-900">
                        {quotation.pricesIncludeChargesAndGst ? "Included" : formatCurrency(quotation.installationCharge)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Transportation</p>
                      <p className="font-medium text-slate-900">
                        {quotation.pricesIncludeChargesAndGst
                          ? "Included"
                          : quotation.transportScope === "CUSTOMER_SCOPE"
                            ? "By Customer"
                            : formatCurrency(quotation.transportationCharge)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        GST ({quotation.gstPercent}%){quotation.pricesIncludeChargesAndGst ? " — Included" : ""}
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
                  {quotation.pricesIncludeChargesAndGst && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Item prices on this quotation already include installation, transportation, and GST.
                    </p>
                  )}
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

              {/* Customer Quotation Acceptance workflow, requirement #14 —
                  sales-side tracking. Only shown once the quotation has
                  actually been sent (nothing to track before that). */}
              {quotation.sentAt && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Customer Tracking</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <Field label="Customer Email" value={quotation.sentToEmail} />
                    <Field label="Sent Date" value={formatDateTime(quotation.sentAt)} />
                    <Field label="View Count" value={String(quotation.viewCount ?? 0)} />
                    <Field label="First Viewed" value={formatDateTime(quotation.firstViewedAt)} />
                    <Field label="Last Viewed" value={formatDateTime(quotation.lastViewedAt)} />
                    <Field
                      label="Link Expires"
                      value={quotation.tokenExpiresAt ? formatDate(quotation.tokenExpiresAt) : null}
                    />
                    {quotation.status === "ACCEPTED" && (
                      <>
                        <Field label="Accepted Date" value={formatDateTime(quotation.acceptedAt)} />
                        <Field label="Accepted By" value="Customer" />
                        <Field label="Accepted By (Name)" value={quotation.acceptedByName} />
                        {quotation.acceptedByDesignation && (
                          <Field label="Designation" value={quotation.acceptedByDesignation} />
                        )}
                        {quotation.acceptanceComment && (
                          <Field label="Comment" value={quotation.acceptanceComment} />
                        )}
                      </>
                    )}
                    {quotation.status === "REJECTED" && (
                      <>
                        <Field label="Rejected Date" value={formatDateTime(quotation.rejectedAt)} />
                        <Field label="Reason" value={quotation.rejectionReason} />
                        {quotation.rejectionComment && (
                          <Field label="Comment" value={quotation.rejectionComment} />
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Email History</CardTitle>
                </CardHeader>
                <CardContent>
                  {emailHistoryLoading ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Spinner /> Loading email history...
                    </p>
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

              {/* Quotation History timeline (requirement #10) — reads the
                  existing generic AuditLog table (module='Quotation'), same
                  storage LeadActivityPanel's Timeline reads for Leads, just
                  scoped to this record via a dedicated non-admin endpoint. */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Quotation History</CardTitle>
                </CardHeader>
                <CardContent>
                  {quotationHistoryLoading ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Spinner /> Loading history...
                    </p>
                  ) : quotationHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
                  ) : (
                    <ol className="space-y-3">
                      {quotationHistory.map((entry) => (
                        <li key={entry.id} className="flex items-start gap-3 border-b pb-3 text-sm last:border-b-0 last:pb-0">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange/10 text-orange">
                            {entry.action.includes("Accepted") ? (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            ) : entry.action.includes("Rejected") ? (
                              <XCircle className="h-3.5 w-3.5" />
                            ) : entry.action.includes("Viewed") ? (
                              <Eye className="h-3.5 w-3.5" />
                            ) : (
                              <Mail className="h-3.5 w-3.5" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                              <p className="font-medium text-slate-900">{entry.action}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatDateTime(entry.createdAt)}
                              </p>
                            </div>
                            {entry.actorName && (
                              <p className="text-xs text-muted-foreground">by {entry.actorName}</p>
                            )}
                            {entry.remarks && <p className="mt-0.5 text-muted-foreground">{entry.remarks}</p>}
                          </div>
                        </li>
                      ))}
                    </ol>
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
        isResend={quotation?.status === "SENT" || quotation?.status === "VIEWED"}
        onSent={() => {
          fetchQuotation();
          fetchEmailHistory();
          fetchQuotationHistory();
        }}
      />
    </div>
  );
}
