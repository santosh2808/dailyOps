import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Pencil, RefreshCw, Trash2 } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ComplaintStatusBadge from "@/components/complaints/ComplaintStatusBadge";
import DeleteComplaintConfirmDialog from "@/components/complaints/DeleteComplaintConfirmDialog";
import ChangeComplaintStatusDialog from "@/components/complaints/ChangeComplaintStatusDialog";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { deleteComplaint, getComplaint, updateComplaintStatus } from "@/api/complaints";
import type { Complaint, ComplaintStatus } from "@/types";

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

  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

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

  const salesOrder = complaint?.salesOrder;
  const customer = salesOrder?.customer;
  const invoice = salesOrder?.proformaInvoices?.[0];

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
    </div>
  );
}
