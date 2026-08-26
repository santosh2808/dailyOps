import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRightCircle, CheckCircle2, FileText, Pencil, RefreshCw, Trash2 } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import LeadStatusBadge from "@/components/leads/LeadStatusBadge";
import LeadPriorityBadge from "@/components/leads/LeadPriorityBadge";
import { nextActionFor, sourceLabel } from "@/components/leads/leadOptions";
import ChangeStatusDialog from "@/components/leads/ChangeStatusDialog";
import DeleteLeadConfirmDialog from "@/components/leads/DeleteLeadConfirmDialog";
import ConvertToCustomerDialog from "@/components/leads/ConvertToCustomerDialog";
import LeadActivityPanel from "@/components/leads/LeadActivityPanel";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { convertLeadToCustomer, deleteLead, getLead, updateLeadStatus } from "@/api/leads";
import { generateQuotationFromLead } from "@/api/quotations";
import type { Lead, LeadStatus } from "@/types";

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
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString();
}

// Lead Management Phase 1 (requirement #6) — exactly four tabs.
const TABS = [
  { key: "overview", label: "Overview" },
  { key: "timeline", label: "Timeline" },
  { key: "notes", label: "Notes" },
  { key: "attachments", label: "Attachments" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function LeadDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusOpen, setStatusOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("overview");
  const [generatingQuotation, setGeneratingQuotation] = useState(false);
  const [generateError, setGenerateError] = useState("");
  // Bumped whenever an action here (status change, conversion) should also
  // refresh the Timeline/Notes tab, since LeadActivityPanel fetches
  // independently of the main lead record.
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const fetchLead = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const data = await getLead(id);
      setLead(data);
    } catch {
      setError("Could not load this lead.");
      toast.error("Could not load this lead.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchLead();
  }, [fetchLead]);

  async function handleStatusConfirm(status: LeadStatus, remarks?: string) {
    if (!id) return;
    await updateLeadStatus(id, status, remarks);
    toast.success("Lead status updated.");
    await fetchLead();
    setHistoryRefreshKey((k) => k + 1);
  }

  async function handleDeleteConfirm() {
    if (!id) return;
    await deleteLead(id);
    toast.success("Lead deleted.");
    navigate("/leads");
  }

  // BUG FIX: converting a Won lead used to just leave the user on this same
  // page — there was no next step shown anywhere, so the workflow appeared
  // to dead-end here. Now it redirects straight to the new Customer
  // Details page, where the Actions section picks up exactly where the
  // Lead workflow leaves off (Generate Sales Order / Proforma Invoice /
  // Job Execution Order).
  async function handleConvertConfirm() {
    if (!id) return;
    const { customer } = await convertLeadToCustomer(id);
    toast.success("Lead converted to customer.");
    navigate(`/customers/${customer.id}`);
  }

  // Lead Management Phase 1 (requirement #8) — one-click Generate
  // Quotation, only reachable while Qualified and only shown once (see
  // nextActionFor: once lead.quotations has an entry, the button becomes
  // "View Quotation" instead of generating a second one).
  async function handleGenerateQuotation() {
    if (!id) return;
    setGeneratingQuotation(true);
    setGenerateError("");
    try {
      const quotation = await generateQuotationFromLead(id);
      toast.success("Quotation generated.");
      navigate(`/quotations/${quotation.id}`);
    } catch (err: any) {
      const message =
        err?.response?.data?.message || "Could not generate a quotation for this lead. Please try again.";
      setGenerateError(message);
      toast.error(message);
      setGeneratingQuotation(false);
    }
  }

  const nextAction = lead ? nextActionFor(lead) : null;
  const latestQuotation = lead?.quotations?.[0];

  function handleNextActionClick() {
    if (!nextAction) return;
    if (nextAction.label === "Generate Quotation") {
      handleGenerateQuotation();
    } else if (nextAction.label === "Send Quotation" || nextAction.label === "View Quotation") {
      if (latestQuotation) navigate(`/quotations/${latestQuotation.id}`);
    } else if (nextAction.label === "Convert to Customer") {
      setConvertOpen(true);
    } else if (nextAction.label === "Assign Sales Person" || nextAction.label === "Contact Customer") {
      navigate(`/leads/${id}/edit`);
    } else {
      setStatusOpen(true);
    }
  }

  const nextActionIsClickable =
    !!nextAction &&
    ["Assign Sales Person", "Contact Customer", "Schedule Follow-up", "Complete Site Visit", "Generate Quotation", "Send Quotation", "View Quotation", "Convert to Customer"].includes(
      nextAction.label,
    );

  return (
    <div className="flex h-screen bg-app-grid">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="Lead Details" />
        <main className="flex-1 overflow-y-auto p-6">
          <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate("/leads")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Leads
          </Button>

          {loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Spinner /> Loading lead...
            </div>
          ) : error || !lead ? (
            <div className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <span>{error || "Lead not found."}</span>
              <Button variant="outline" size="sm" onClick={fetchLead}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          ) : (
            <div className="mx-auto max-w-4xl space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">{lead.leadNumber}</h2>
                  <p className="text-sm text-muted-foreground">{lead.title}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {lead.status === "WON" && !lead.isConverted && (
                    <Button onClick={() => setConvertOpen(true)}>
                      <ArrowRightCircle className="mr-2 h-4 w-4" />
                      Convert to Customer
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setStatusOpen(true)}>
                    Change Status
                  </Button>
                  <Button variant="outline" onClick={() => navigate(`/leads/${lead.id}/edit`)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                  <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </div>

              {/* Lead Management Phase 1 (requirement #12) — always show the
                  next available action so nobody has to wonder what to do. */}
              {nextAction && nextAction.label && (
                <Card>
                  <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Next: {nextAction.label}</p>
                      <p className="text-sm text-muted-foreground">{nextAction.hint}</p>
                      {generateError && <p className="mt-1 text-sm text-destructive">{generateError}</p>}
                    </div>
                    {nextActionIsClickable && (
                      <Button
                        onClick={handleNextActionClick}
                        disabled={generatingQuotation}
                        variant={nextAction.label === "Waiting for Customer Response" ? "outline" : "default"}
                      >
                        {generatingQuotation && nextAction.label === "Generate Quotation" ? (
                          <>
                            <Spinner className="mr-2 h-4 w-4" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <FileText className="mr-2 h-4 w-4" />
                            {nextAction.label}
                          </>
                        )}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}

              {lead.isConverted && (
                <Card>
                  <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2 text-emerald-700">
                      <CheckCircle2 className="h-5 w-5" />
                      <span className="text-sm font-medium">
                        Converted{formatDate(lead.convertedAt) ? ` on ${formatDate(lead.convertedAt)}` : ""} — Customer:{" "}
                        {lead.companyName}
                      </span>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => navigate("/customers")}>
                      View Customer
                    </Button>
                  </CardContent>
                </Card>
              )}

              <div className="inline-flex rounded-md border p-1">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={`rounded-sm px-3 py-1.5 text-sm font-medium transition-colors ${
                      tab === t.key ? "bg-orange text-white" : "text-muted-foreground hover:text-slate-900"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === "overview" && (
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Pipeline</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <Field label="Status" value={<LeadStatusBadge status={lead.status} />} />
                      <Field label="Priority" value={<LeadPriorityBadge priority={lead.priority} />} />
                      <Field label="Source" value={sourceLabel(lead.source)} />
                      <Field label="Estimated Value" value={formatCurrency(lead.estimatedValue)} />
                      <Field label="Expected Close Date" value={formatDate(lead.expectedCloseDate)} />
                      <Field label="Next Follow-up" value={formatDate(lead.nextFollowUp)} />
                      <Field label="Reminder" value={lead.reminderNote} />
                      {/* Full name only — never the role — with an explicit
                          "Unassigned" label (Field's own generic fallback is a
                          bare "—") when no user is assigned. */}
                      <Field label="Assigned To" value={lead.assignedToUser?.name || "Unassigned"} />
                      <Field label="Created" value={formatDate(lead.createdAt)} />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Basic Information</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                      <Field label="Company Name" value={lead.companyName} />
                      <Field label="Contact Person" value={lead.contactPerson} />
                      <Field label="Designation" value={lead.designation} />
                      <Field label="Email" value={lead.email} />
                      <Field label="Phone" value={lead.phone} />
                      <Field label="Alternate Phone" value={lead.alternatePhone} />
                      <Field label="City" value={lead.city} />
                      <Field label="State" value={lead.state} />
                      <Field label="Country" value={lead.country} />
                      <Field label="Industry" value={lead.industry} />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Products</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {lead.products && lead.products.length > 0 ? (
                        <div className="space-y-2">
                          {lead.products.map((lp) => (
                            <div
                              key={lp.id}
                              className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                            >
                              <div>
                                <p className="font-medium text-slate-900">
                                  {lp.product?.name ?? "Unknown product"}
                                </p>
                                {lp.remarks && (
                                  <p className="text-xs text-muted-foreground">{lp.remarks}</p>
                                )}
                              </div>
                              <div className="text-right text-muted-foreground">
                                <p>Qty: {lp.quantity}</p>
                                {lp.unitPrice != null && <p>{formatCurrency(lp.unitPrice)} / unit</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No products linked to this lead yet.</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Description & Remarks</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Field label="Description" value={lead.description} />
                      <Field label="Remarks" value={lead.remarks} />
                    </CardContent>
                  </Card>

                  {lead.quotations && lead.quotations.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Quotations</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {lead.quotations.map((q) => (
                          <button
                            key={q.id}
                            type="button"
                            onClick={() => navigate(`/quotations/${q.id}`)}
                            className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-slate-50"
                          >
                            <span className="font-medium text-slate-900">{q.quotationNumber}</span>
                            <span className="text-muted-foreground">{q.status}</span>
                          </button>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {tab === "timeline" && (
                <Card>
                  <CardContent className="pt-6">
                    <LeadActivityPanel leadId={lead.id} refreshKey={historyRefreshKey} view="timeline" />
                  </CardContent>
                </Card>
              )}

              {tab === "notes" && (
                <Card>
                  <CardContent className="pt-6">
                    <LeadActivityPanel leadId={lead.id} refreshKey={historyRefreshKey} view="notes" />
                  </CardContent>
                </Card>
              )}

              {tab === "attachments" && (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">
                      Attachments are coming in a future release.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </main>
      </div>

      <ChangeStatusDialog
        open={statusOpen}
        onOpenChange={setStatusOpen}
        lead={lead}
        onConfirm={handleStatusConfirm}
      />
      <DeleteLeadConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        lead={lead}
        onConfirm={handleDeleteConfirm}
      />
      <ConvertToCustomerDialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        lead={lead}
        onConfirm={handleConvertConfirm}
      />
    </div>
  );
}
