import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRightCircle, Pencil, RefreshCw, Search, ShieldCheck, Trash2 } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import ComplaintStatusBadge from "@/components/complaints/ComplaintStatusBadge";
import DeleteComplaintConfirmDialog from "@/components/complaints/DeleteComplaintConfirmDialog";
import ChangeComplaintStatusDialog from "@/components/complaints/ChangeComplaintStatusDialog";
import ConvertToLeadDialog from "@/components/complaints/ConvertToLeadDialog";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { useAuth } from "@/context/AuthContext";
import {
  deleteComplaint,
  getComplaint,
  getComplaintEmailHistory,
  linkComplaintInvoice,
  lookupComplaintInvoice,
  replyToComplaint,
  updateComplaintStatus,
  type InvoiceLookupResult,
} from "@/api/complaints";
import type { Complaint, ComplaintStatus, EmailHistoryEntry } from "@/types";

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm text-slate-900">{value || "—"}</p>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString();
}

function formatCurrency(value?: number | null) {
  if (value == null) return null;
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export default function ComplaintDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [convertToLeadOpen, setConvertToLeadOpen] = useState(false);

  // Invoice Verification — search-then-link flow.
  const [invoiceNumberInput, setInvoiceNumberInput] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupResult, setLookupResult] = useState<InvoiceLookupResult | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [linking, setLinking] = useState(false);

  // Reply-to-customer composer + email history.
  const [replyMessage, setReplyMessage] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [emailHistory, setEmailHistory] = useState<EmailHistoryEntry[]>([]);
  const [emailHistoryLoading, setEmailHistoryLoading] = useState(false);

  const fetchComplaint = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const data = await getComplaint(id);
      setComplaint(data);
    } catch {
      setError("Could not load this complaint.");
      toast.error("Could not load this complaint.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchComplaint();
  }, [fetchComplaint]);

  const fetchEmailHistory = useCallback(async () => {
    if (!id) return;
    setEmailHistoryLoading(true);
    try {
      const data = await getComplaintEmailHistory(id);
      setEmailHistory(data);
    } catch {
      // Non-critical — the composer itself still works without a history list.
    } finally {
      setEmailHistoryLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchEmailHistory();
  }, [fetchEmailHistory]);

  async function handleSendReply() {
    if (!id || !replyMessage.trim()) return;
    setSendingReply(true);
    try {
      const result = await replyToComplaint(id, replyMessage.trim());
      if (result.status === "FAILED") {
        toast.error("The reply could not be sent. Check the customer's email and try again.");
      } else {
        toast.success(result.status === "SIMULATED" ? "Reply logged (no SMTP configured)." : "Reply sent.");
        setReplyMessage("");
      }
      await fetchEmailHistory();
    } catch {
      toast.error("Could not send the reply. Please try again.");
    } finally {
      setSendingReply(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!id) return;
    await deleteComplaint(id);
    toast.success("Complaint deleted.");
    navigate("/complaints");
  }

  async function handleStatusConfirm(status: ComplaintStatus, resolutionNotes?: string) {
    if (!id) return;
    await updateComplaintStatus(id, { status, resolutionNotes });
    toast.success(`Status updated to ${status.replace("_", " ")}.`);
    await fetchComplaint();
  }

  async function handleLookupInvoice() {
    if (!id || !invoiceNumberInput.trim()) return;
    setLookingUp(true);
    setLookupResult(null);
    setSelectedItemId("");
    try {
      const result = await lookupComplaintInvoice(id, invoiceNumberInput.trim());
      setLookupResult(result);
      if (!result.found) {
        toast.error("No tax invoice found with that number.");
      }
    } catch {
      toast.error("Invoice lookup failed. Please try again.");
    } finally {
      setLookingUp(false);
    }
  }

  async function handleLinkInvoice() {
    if (!id || !lookupResult?.found) return;
    setLinking(true);
    try {
      await linkComplaintInvoice(id, {
        taxInvoiceId: lookupResult.invoice.id,
        taxInvoiceItemId: selectedItemId || undefined,
      });
      toast.success("Invoice linked and verified.");
      setLookupResult(null);
      setInvoiceNumberInput("");
      await fetchComplaint();
    } catch {
      toast.error("Could not link this invoice. Please try again.");
    } finally {
      setLinking(false);
    }
  }

  const salesOrder = complaint?.salesOrder;
  const customer = salesOrder?.customer;
  const invoice = salesOrder?.proformaInvoices?.[0];
  const canConvertToLead = hasPermission("Complaint", "Edit") && hasPermission("Lead", "Create");
  const recipientEmail = complaint?.reporterEmail || customer?.email || null;

  return (
    <div className="flex h-screen bg-app-grid">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="Complaint Details" showBackButton />
        <main className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Spinner /> Loading complaint...
            </div>
          ) : error || !complaint ? (
            <div className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <span>{error || "Complaint not found."}</span>
              <Button variant="outline" size="sm" onClick={fetchComplaint}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          ) : (
            <div className="mx-auto max-w-4xl space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">{complaint.complaintNumber}</h2>
                  <p className="text-sm text-muted-foreground">{complaint.subject}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!complaint.convertedToLeadId && canConvertToLead && (
                    <Button variant="outline" onClick={() => setConvertToLeadOpen(true)}>
                      <ArrowRightCircle className="mr-2 h-4 w-4" />
                      Convert to Lead
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setStatusOpen(true)}>
                    Change Status
                  </Button>
                  <Button variant="outline" onClick={() => navigate(`/complaints/${complaint.id}/edit`)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                  <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </div>

              {complaint.convertedToLeadId && (
                <Card>
                  <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <Badge variant="warning">Converted to Lead</Badge>
                    <Button variant="outline" size="sm" onClick={() => navigate(`/leads/${complaint.convertedToLeadId}`)}>
                      View Lead
                    </Button>
                  </CardContent>
                </Card>
              )}

              {complaint.sourceWebsiteId && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Website Submission</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <Field label="Website" value={complaint.sourceWebsite?.name} />
                      <Field
                        label="Subject"
                        value={complaint.webFormIntake?.subjectLabel || complaint.sourceSubjectCode}
                      />
                      <Field label="Reference No." value={complaint.webFormIntake?.referenceNumber} />
                      <Field label="Submitted On" value={formatDate(complaint.webFormIntake?.createdAt)} />
                    </div>
                    {complaint.webFormIntake?.submittedData &&
                      Object.keys(complaint.webFormIntake.submittedData).length > 0 && (
                        <div>
                          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Submitted Fields
                          </p>
                          <div className="space-y-1 rounded-md border p-3 text-sm">
                            {Object.entries(complaint.webFormIntake.submittedData).map(([key, value]) => (
                              <div key={key} className="flex justify-between gap-4">
                                <span className="text-muted-foreground">{key}</span>
                                <span className="text-right text-slate-900">{String(value)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                  </CardContent>
                </Card>
              )}

              {complaint.source !== "INTERNAL" && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Reporter</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Field label="Name" value={complaint.reporterName} />
                    <Field label="Email" value={complaint.reporterEmail} />
                    <Field label="Phone" value={complaint.reporterPhone} />
                    <Field label="Claimed Invoice No." value={complaint.claimedInvoiceNumber} />
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Invoice Verification</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {complaint.taxInvoiceId ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge variant="success">
                        <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                        Verified
                      </Badge>
                      <span className="text-sm text-slate-900">
                        Tax Invoice: <span className="font-medium">{complaint.taxInvoice?.invoiceNumber}</span>
                      </span>
                      {complaint.taxInvoiceItem && (
                        <span className="text-sm text-muted-foreground">
                          Item: {complaint.taxInvoiceItem.productName}
                          {complaint.taxInvoiceItem.productSku ? ` (${complaint.taxInvoiceItem.productSku})` : ""}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {complaint.claimedInvoiceNumber && (
                        <p className="text-sm text-muted-foreground">
                          Reporter claimed invoice number:{" "}
                          <span className="font-medium text-slate-900">{complaint.claimedInvoiceNumber}</span>
                        </p>
                      )}
                      <div className="flex items-end gap-2">
                        <div className="flex-1 space-y-2">
                          <Label htmlFor="invoice-lookup-input">Invoice Number</Label>
                          <Input
                            id="invoice-lookup-input"
                            placeholder="SRM/2026-27/135"
                            value={invoiceNumberInput}
                            onChange={(e) => setInvoiceNumberInput(e.target.value)}
                          />
                        </div>
                        <Button onClick={handleLookupInvoice} disabled={lookingUp || !invoiceNumberInput.trim()}>
                          {lookingUp ? <Spinner className="mr-2 h-4 w-4" /> : <Search className="mr-2 h-4 w-4" />}
                          Look Up
                        </Button>
                      </div>

                      {lookupResult && !lookupResult.found && (
                        <p className="text-sm text-destructive">Not Found — no tax invoice matches that number.</p>
                      )}

                      {lookupResult?.found && (
                        <div className="space-y-3 rounded-md border p-3">
                          <p className="text-sm">
                            Found Tax Invoice{" "}
                            <span className="font-medium text-slate-900">{lookupResult.invoice.invoiceNumber}</span>
                          </p>
                          <div className="space-y-2">
                            <Label htmlFor="invoice-item-select">Line Item (optional)</Label>
                            <select
                              id="invoice-item-select"
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                              value={selectedItemId}
                              onChange={(e) => setSelectedItemId(e.target.value)}
                            >
                              <option value="">Link invoice without a specific item</option>
                              {lookupResult.items.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.productName} — Qty {item.quantity}
                                </option>
                              ))}
                            </select>
                          </div>
                          <Button onClick={handleLinkInvoice} disabled={linking}>
                            {linking && <Spinner className="mr-2 h-4 w-4" />}
                            {linking ? "Linking..." : "Link Invoice"}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Communication</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {recipientEmail ? (
                    <div className="space-y-2">
                      <Label htmlFor="reply-message">
                        Reply to <span className="font-medium text-slate-900">{recipientEmail}</span>
                      </Label>
                      <Textarea
                        id="reply-message"
                        rows={3}
                        placeholder="e.g. We couldn't find a tax invoice matching the number you provided — could you double-check it and resend?"
                        value={replyMessage}
                        onChange={(e) => setReplyMessage(e.target.value)}
                      />
                      <div className="flex justify-end">
                        <Button onClick={handleSendReply} disabled={sendingReply || !replyMessage.trim()}>
                          {sendingReply && <Spinner className="mr-2 h-4 w-4" />}
                          {sendingReply ? "Sending..." : "Send Reply"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No customer email on file for this complaint — a reply can't be sent.
                    </p>
                  )}

                  <div className="space-y-2 border-t pt-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Email History
                    </p>
                    {emailHistoryLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Spinner className="h-3.5 w-3.5" /> Loading...
                      </div>
                    ) : emailHistory.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No emails sent yet for this complaint.</p>
                    ) : (
                      <ul className="space-y-2">
                        {emailHistory.map((entry) => (
                          <li key={entry.id} className="rounded-md border p-2 text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-slate-900">{entry.subject}</span>
                              <Badge
                                variant={
                                  entry.status === "SENT"
                                    ? "success"
                                    : entry.status === "FAILED"
                                      ? "destructive"
                                      : "muted"
                                }
                              >
                                {entry.status}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              To {entry.recipientEmail} · {formatDate(entry.sentAt)}
                            </p>
                            {entry.errorMessage && (
                              <p className="mt-1 text-xs text-destructive">{entry.errorMessage}</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Complaint</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <Field label="Complaint Number" value={complaint.complaintNumber} />
                  <Field label="Status" value={<ComplaintStatusBadge status={complaint.status} />} />
                  <Field label="Subject" value={complaint.subject} />
                  <Field label="Description" value={complaint.description} />
                  <Field label="Logged By" value={complaint.createdBy} />
                  <Field label="Logged On" value={formatDate(complaint.createdAt)} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Linked Sales Order</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <Field
                    label="Sales Order No."
                    value={
                      salesOrder ? (
                        <button
                          type="button"
                          className="text-left text-srm-green hover:underline"
                          onClick={() => navigate(`/sales-orders/${salesOrder.id}`)}
                        >
                          {salesOrder.salesOrderNumber}
                        </button>
                      ) : null
                    }
                  />
                  <Field label="Order Value" value={formatCurrency(salesOrder?.grandTotal)} />
                  <Field label="Customer" value={customer?.companyName} />
                  <Field label="Contact Person" value={customer?.contactPerson} />
                  <Field label="Phone" value={customer?.phone} />
                  <Field label="Email" value={customer?.email} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Proforma Invoice</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {invoice ? (
                    <>
                      <Field label="Invoice No." value={invoice.invoiceNumber} />
                      <Field label="Invoice Amount" value={formatCurrency(invoice.grandTotal)} />
                      <Field label="Invoice Status" value={invoice.status} />
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No proforma invoice has been generated for this sales order yet.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Resolution</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <Field label="Resolution Notes" value={complaint.resolutionNotes} />
                  <Field label="Resolved On" value={formatDate(complaint.resolvedAt)} />
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </div>

      <DeleteComplaintConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        complaint={complaint}
        onConfirm={handleDeleteConfirm}
      />
      <ChangeComplaintStatusDialog
        open={statusOpen}
        onOpenChange={setStatusOpen}
        complaint={complaint}
        onConfirm={handleStatusConfirm}
      />
      <ConvertToLeadDialog open={convertToLeadOpen} onOpenChange={setConvertToLeadOpen} complaint={complaint} />
    </div>
  );
}
