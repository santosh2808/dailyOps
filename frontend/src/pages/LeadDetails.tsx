import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRightCircle, CheckCircle2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import LeadStatusBadge from "@/components/leads/LeadStatusBadge";
import LeadPriorityBadge from "@/components/leads/LeadPriorityBadge";
import { sourceLabel } from "@/components/leads/leadOptions";
import ChangeStatusDialog from "@/components/leads/ChangeStatusDialog";
import DeleteLeadConfirmDialog from "@/components/leads/DeleteLeadConfirmDialog";
import ConvertToCustomerDialog from "@/components/leads/ConvertToCustomerDialog";
import { convertLeadToCustomer, deleteLead, getLead, updateLeadStatus } from "@/api/leads";
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

export default function LeadDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusOpen, setStatusOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);

  const fetchLead = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const data = await getLead(id);
      setLead(data);
    } catch {
      setError("Could not load this lead.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchLead();
  }, [fetchLead]);

  async function handleStatusConfirm(status: LeadStatus) {
    if (!id) return;
    await updateLeadStatus(id, status);
    await fetchLead();
  }

  async function handleDeleteConfirm() {
    if (!id) return;
    await deleteLead(id);
    navigate("/leads");
  }

  async function handleConvertConfirm() {
    if (!id) return;
    await convertLeadToCustomer(id);
    await fetchLead();
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="Lead Details" />
        <main className="flex-1 overflow-y-auto p-6">
          <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate("/leads")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Leads
          </Button>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading lead...</p>
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
                  <Field label="Assigned To" value={lead.assignedTo} />
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

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Timeline</CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Placeholder: activity timeline (status changes, calls, notes)
                      is planned for a future release and is intentionally not
                      implemented here. */}
                  <p className="text-sm text-muted-foreground">
                    Activity timeline is coming in a future release.
                  </p>
                </CardContent>
              </Card>
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
