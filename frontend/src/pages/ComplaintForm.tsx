import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SalesOrderPicker from "@/components/complaints/SalesOrderPicker";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { createComplaint, getComplaint, updateComplaint, type ComplaintPayload } from "@/api/complaints";
import type { SalesOrder } from "@/types";

interface FormState {
  salesOrderId: string;
  subject: string;
  description: string;
}

const emptyForm: FormState = {
  salesOrderId: "",
  subject: "",
  description: "",
};

export default function ComplaintForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [selectedSalesOrder, setSelectedSalesOrder] = useState<SalesOrder | null>(null);
  const [complaintNumber, setComplaintNumber] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [loading, setLoading] = useState(isEdit);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!isEdit || !id) return;
      setLoading(true);
      try {
        const complaint = await getComplaint(id);
        if (cancelled) return;
        setComplaintNumber(complaint.complaintNumber);
        setForm({
          salesOrderId: complaint.salesOrderId,
          subject: complaint.subject,
          description: complaint.description ?? "",
        });
        if (complaint.salesOrder) {
          setSelectedSalesOrder(complaint.salesOrder as unknown as SalesOrder);
        }
      } catch {
        setSubmitError("Could not load this complaint.");
        toast.error("Could not load this complaint.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [isEdit, id]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {};

    if (!isEdit && !form.salesOrderId) next.salesOrderId = "Please select a sales order";
    if (!form.subject.trim()) next.subject = "Subject is required";

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError("");
    if (!validate()) return;

    setSubmitting(true);
    try {
      if (isEdit && id) {
        await updateComplaint(id, {
          subject: form.subject.trim(),
          description: form.description.trim() || undefined,
        });
        toast.success("Complaint updated successfully.");
        navigate(`/complaints/${id}`);
      } else {
        const payload: ComplaintPayload = {
          salesOrderId: form.salesOrderId,
          subject: form.subject.trim(),
          description: form.description.trim() || undefined,
        };
        const created = await createComplaint(payload);
        toast.success("Complaint logged successfully.");
        navigate(`/complaints/${created.id}`);
      }
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        "Something went wrong while saving this complaint. Please try again.";
      const text = Array.isArray(message) ? message.join(", ") : message;
      setSubmitError(text);
      toast.error(text);
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen bg-app-grid">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title={isEdit ? "Edit Complaint" : "Log Complaint"} showBackButton />
        <main className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Spinner /> Loading complaint...
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mx-auto max-w-3xl space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Complaint Details</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4">
                  {isEdit && (
                    <div className="space-y-2">
                      <Label>Complaint Number</Label>
                      <Input value={complaintNumber ?? ""} disabled />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="salesOrderId">Sales Order *</Label>
                    {isEdit ? (
                      <Input
                        value={
                          selectedSalesOrder
                            ? `${selectedSalesOrder.salesOrderNumber} — ${selectedSalesOrder.customer?.companyName ?? ""}`
                            : form.salesOrderId
                        }
                        disabled
                      />
                    ) : (
                      <SalesOrderPicker
                        value={form.salesOrderId}
                        selectedSalesOrder={selectedSalesOrder}
                        onChange={(order) => {
                          setSelectedSalesOrder(order);
                          update("salesOrderId", order?.id ?? "");
                        }}
                      />
                    )}
                    {errors.salesOrderId && (
                      <p className="text-xs text-destructive">{errors.salesOrderId}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="subject">Subject *</Label>
                    <Input
                      id="subject"
                      value={form.subject}
                      onChange={(e) => update("subject", e.target.value)}
                      placeholder="Short summary of the complaint"
                    />
                    {errors.subject && <p className="text-xs text-destructive">{errors.subject}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={form.description}
                      onChange={(e) => update("description", e.target.value)}
                      placeholder="What went wrong, and any other details the customer shared"
                    />
                  </div>
                </CardContent>
              </Card>

              {submitError && <p className="text-sm text-destructive">{submitError}</p>}

              <div className="flex justify-end gap-2 pb-6">
                <Button type="button" variant="outline" onClick={() => navigate(-1)} disabled={submitting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Spinner className="mr-2 h-4 w-4" />}
                  {submitting ? "Saving..." : isEdit ? "Save Changes" : "Log Complaint"}
                </Button>
              </div>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}
