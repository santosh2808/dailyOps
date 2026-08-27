import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import LeadProductsSelector from "@/components/leads/LeadProductsSelector";
import AssignedToPicker from "@/components/leads/AssignedToPicker";
import { PRIORITY_OPTIONS, SOURCE_OPTIONS } from "@/components/leads/leadOptions";
import { INDIA_STATES } from "@/lib/indiaStates";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { isPastDateInputValue, todayDateInputValue } from "@/lib/date";
import { createLead, getLead, updateLead, type LeadPayload, type LeadProductPayload } from "@/api/leads";
import type { LeadPriority, LeadSource } from "@/types";

interface FormState {
  companyName: string;
  contactPerson: string;
  designation: string;
  email: string;
  phone: string;
  alternatePhone: string;
  city: string;
  state: string;
  country: string;
  industry: string;
  title: string;
  description: string;
  estimatedValue: string;
  priority: LeadPriority;
  source: LeadSource;
  expectedCloseDate: string;
  nextFollowUp: string;
  // Lead Management Phase 1 (requirement #5) — short free-text reminder
  // alongside the follow-up date, e.g. "Call before 3pm".
  reminderNote: string;
  remarks: string;
  assignedToUserId: string;
}

const emptyForm: FormState = {
  companyName: "",
  contactPerson: "",
  designation: "",
  email: "",
  phone: "",
  alternatePhone: "",
  city: "",
  state: "",
  country: "",
  industry: "",
  title: "",
  description: "",
  estimatedValue: "",
  priority: "MEDIUM",
  source: "OTHER",
  expectedCloseDate: "",
  nextFollowUp: "",
  reminderNote: "",
  remarks: "",
  assignedToUserId: "",
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\d{10,15}$/;

// Dates come back from the API as full ISO timestamps; <input type="date">
// needs just the yyyy-mm-dd portion.
function toDateInputValue(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

export default function LeadForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [products, setProducts] = useState<LeadProductPayload[]>([]);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [loading, setLoading] = useState(isEdit);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isEdit || !id) return;
    const leadId = id;
    let cancelled = false;
    async function loadLead() {
      setLoading(true);
      try {
        const lead = await getLead(leadId);
        if (cancelled) return;
        setForm({
          companyName: lead.companyName,
          contactPerson: lead.contactPerson,
          designation: lead.designation ?? "",
          email: lead.email ?? "",
          phone: lead.phone,
          alternatePhone: lead.alternatePhone ?? "",
          city: lead.city ?? "",
          state: lead.state ?? "",
          country: lead.country ?? "",
          industry: lead.industry ?? "",
          title: lead.title,
          description: lead.description ?? "",
          estimatedValue: lead.estimatedValue != null ? String(lead.estimatedValue) : "",
          priority: lead.priority,
          source: lead.source,
          expectedCloseDate: toDateInputValue(lead.expectedCloseDate),
          nextFollowUp: toDateInputValue(lead.nextFollowUp),
          reminderNote: lead.reminderNote ?? "",
          remarks: lead.remarks ?? "",
          assignedToUserId: lead.assignedToUserId ?? "",
        });
        setProducts(
          (lead.products ?? []).map((p) => ({
            productId: p.productId,
            quantity: p.quantity,
            unitPrice: p.unitPrice ?? undefined,
            remarks: p.remarks ?? undefined,
          }))
        );
      } catch {
        setSubmitError("Could not load this lead.");
        toast.error("Could not load this lead.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadLead();
    return () => {
      cancelled = true;
    };
  }, [isEdit, id]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {};

    if (!form.companyName.trim()) next.companyName = "Company name is required";
    if (!form.contactPerson.trim()) next.contactPerson = "Contact person is required";
    if (!form.title.trim()) next.title = "Title is required";
    // Required — see CreateLeadDto: every lead needs a state so it can be
    // carried over to Customer.state on conversion and show up on the
    // Dashboard's India Sales Map, and needs an owner so nothing sits
    // unassigned.
    if (!form.state.trim()) next.state = "State is required";
    if (!form.assignedToUserId) next.assignedToUserId = "Assigning this lead to a user is required";
    if (!form.phone.trim()) {
      next.phone = "Phone is required";
    } else if (!PHONE_REGEX.test(form.phone.trim())) {
      next.phone = "Phone must be 10-15 digits";
    }
    if (form.alternatePhone.trim() && !PHONE_REGEX.test(form.alternatePhone.trim())) {
      next.alternatePhone = "Alternate phone must be 10-15 digits";
    }
    if (form.email.trim() && !EMAIL_REGEX.test(form.email.trim())) {
      next.email = "Enter a valid email address";
    }
    if (form.estimatedValue.trim()) {
      const parsed = Number(form.estimatedValue);
      if (Number.isNaN(parsed) || parsed < 0) {
        next.estimatedValue = "Estimated value must be a positive number";
      }
    }
    // Both are forward-looking planning dates — a past Expected Close Date
    // or Next Follow-up doesn't make sense to set going forward. `min` on
    // the inputs below stops the calendar picker from offering one; this
    // catches a manually typed/pasted past date too.
    if (isPastDateInputValue(form.expectedCloseDate)) {
      next.expectedCloseDate = "Expected Close Date cannot be before today";
    }
    if (isPastDateInputValue(form.nextFollowUp)) {
      next.nextFollowUp = "Next Follow-up cannot be before today";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError("");
    if (!validate()) return;

    const payload: LeadPayload = {
      companyName: form.companyName.trim(),
      contactPerson: form.contactPerson.trim(),
      designation: form.designation.trim() || undefined,
      email: form.email.trim() || undefined,
      phone: form.phone.trim(),
      alternatePhone: form.alternatePhone.trim() || undefined,
      city: form.city.trim() || undefined,
      state: form.state,
      country: form.country.trim() || undefined,
      industry: form.industry.trim() || undefined,
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      products: products.length > 0 ? products : undefined,
      estimatedValue: form.estimatedValue.trim() ? Number(form.estimatedValue) : undefined,
      priority: form.priority,
      source: form.source,
      expectedCloseDate: form.expectedCloseDate || undefined,
      nextFollowUp: form.nextFollowUp || undefined,
      reminderNote: form.reminderNote.trim() || undefined,
      remarks: form.remarks.trim() || undefined,
      // Explicit null (not undefined) when cleared, so an edit that
      // unassigns a lead actually clears it rather than being ignored by
      // updateLead()'s partial-payload semantics.
      assignedToUserId: form.assignedToUserId || null,
    };

    setSubmitting(true);
    try {
      if (isEdit && id) {
        await updateLead(id, payload);
        toast.success("Lead updated successfully.");
        navigate(`/leads/${id}`);
      } else {
        const created = await createLead(payload);
        toast.success("Lead created successfully.");
        navigate(`/leads/${created.id}`);
      }
    } catch {
      const message = "Something went wrong while saving this lead. Please try again.";
      setSubmitError(message);
      toast.error(message);
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen bg-app-grid">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title={isEdit ? "Edit Lead" : "Create Lead"} />
        <main className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Spinner /> Loading lead...
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mx-auto max-w-4xl space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Basic Information</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Company Name *</Label>
                    <Input
                      id="companyName"
                      value={form.companyName}
                      onChange={(e) => update("companyName", e.target.value)}
                    />
                    {errors.companyName && (
                      <p className="text-xs text-destructive">{errors.companyName}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contactPerson">Contact Person *</Label>
                    <Input
                      id="contactPerson"
                      value={form.contactPerson}
                      onChange={(e) => update("contactPerson", e.target.value)}
                    />
                    {errors.contactPerson && (
                      <p className="text-xs text-destructive">{errors.contactPerson}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="designation">Designation</Label>
                    <Input
                      id="designation"
                      value={form.designation}
                      onChange={(e) => update("designation", e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(e) => update("email", e.target.value)}
                    />
                    {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone *</Label>
                    <Input
                      id="phone"
                      inputMode="numeric"
                      value={form.phone}
                      onChange={(e) => update("phone", e.target.value)}
                      placeholder="9876543210"
                    />
                    {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="alternatePhone">Alternate Phone</Label>
                    <Input
                      id="alternatePhone"
                      inputMode="numeric"
                      value={form.alternatePhone}
                      onChange={(e) => update("alternatePhone", e.target.value)}
                    />
                    {errors.alternatePhone && (
                      <p className="text-xs text-destructive">{errors.alternatePhone}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input id="city" value={form.city} onChange={(e) => update("city", e.target.value)} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="state">State *</Label>
                    <Select id="state" value={form.state} onChange={(e) => update("state", e.target.value)}>
                      <option value="">Select state...</option>
                      {INDIA_STATES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                    {errors.state && <p className="text-xs text-destructive">{errors.state}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <Input
                      id="country"
                      value={form.country}
                      onChange={(e) => update("country", e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="industry">Industry</Label>
                    <Input
                      id="industry"
                      value={form.industry}
                      onChange={(e) => update("industry", e.target.value)}
                      placeholder="e.g. Manufacturing"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Opportunity Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Title *</Label>
                    <Input
                      id="title"
                      value={form.title}
                      onChange={(e) => update("title", e.target.value)}
                      placeholder="e.g. HVLS fans for new warehouse"
                    />
                    {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={form.description}
                      onChange={(e) => update("description", e.target.value)}
                    />
                  </div>

                  <LeadProductsSelector value={products} onChange={setProducts} />

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="estimatedValue">Estimated Value</Label>
                      <Input
                        id="estimatedValue"
                        inputMode="decimal"
                        value={form.estimatedValue}
                        onChange={(e) => update("estimatedValue", e.target.value)}
                      />
                      {errors.estimatedValue && (
                        <p className="text-xs text-destructive">{errors.estimatedValue}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="priority">Priority</Label>
                      <Select
                        id="priority"
                        value={form.priority}
                        onChange={(e) => update("priority", e.target.value as LeadPriority)}
                      >
                        {PRIORITY_OPTIONS.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="source">Lead Source</Label>
                      <Select
                        id="source"
                        value={form.source}
                        onChange={(e) => update("source", e.target.value as LeadSource)}
                      >
                        {SOURCE_OPTIONS.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="expectedCloseDate">Expected Close Date</Label>
                      <Input
                        id="expectedCloseDate"
                        type="date"
                        min={todayDateInputValue()}
                        value={form.expectedCloseDate}
                        onChange={(e) => update("expectedCloseDate", e.target.value)}
                      />
                      {errors.expectedCloseDate && (
                        <p className="text-xs text-destructive">{errors.expectedCloseDate}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="nextFollowUp">Next Follow-up</Label>
                      <Input
                        id="nextFollowUp"
                        type="date"
                        min={todayDateInputValue()}
                        value={form.nextFollowUp}
                        onChange={(e) => update("nextFollowUp", e.target.value)}
                      />
                      {errors.nextFollowUp && (
                        <p className="text-xs text-destructive">{errors.nextFollowUp}</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reminderNote">Reminder</Label>
                    <Input
                      id="reminderNote"
                      value={form.reminderNote}
                      onChange={(e) => update("reminderNote", e.target.value)}
                      placeholder="e.g. Call before 3pm"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Assigned To *</Label>
                    <AssignedToPicker
                      value={form.assignedToUserId || null}
                      onChange={(userId) => update("assignedToUserId", userId ?? "")}
                    />
                    {errors.assignedToUserId && (
                      <p className="text-xs text-destructive">{errors.assignedToUserId}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="remarks">Remarks</Label>
                    <Textarea
                      id="remarks"
                      value={form.remarks}
                      onChange={(e) => update("remarks", e.target.value)}
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
                  {submitting ? "Saving..." : isEdit ? "Save Changes" : "Create Lead"}
                </Button>
              </div>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}
