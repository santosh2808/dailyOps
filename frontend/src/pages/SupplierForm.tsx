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
import { STATUS_OPTIONS } from "@/components/suppliers/supplierOptions";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { createSupplier, getSupplier, updateSupplier, type SupplierPayload } from "@/api/suppliers";
import type { SupplierStatus } from "@/types";

interface FormState {
  supplierName: string;
  gstNumber: string;
  panNumber: string;
  contactPerson: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  city: string;
  state: string;
  country: string;
  pinCode: string;
  paymentTerms: string;
  leadTime: string;
  currency: string;
  remarks: string;
  status: SupplierStatus;
}

const emptyForm: FormState = {
  supplierName: "",
  gstNumber: "",
  panNumber: "",
  contactPerson: "",
  phone: "",
  email: "",
  website: "",
  address: "",
  city: "",
  state: "",
  country: "",
  pinCode: "",
  paymentTerms: "",
  leadTime: "",
  currency: "",
  remarks: "",
  status: "ACTIVE",
};

const PHONE_REGEX = /^\+?\d{10,15}$/;

export default function SupplierForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [supplierCode, setSupplierCode] = useState<string | null>(null);
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
        const supplier = await getSupplier(id);
        if (cancelled) return;
        setSupplierCode(supplier.supplierCode);
        setForm({
          supplierName: supplier.supplierName,
          gstNumber: supplier.gstNumber ?? "",
          panNumber: supplier.panNumber ?? "",
          contactPerson: supplier.contactPerson ?? "",
          phone: supplier.phone ?? "",
          email: supplier.email ?? "",
          website: supplier.website ?? "",
          address: supplier.address ?? "",
          city: supplier.city ?? "",
          state: supplier.state ?? "",
          country: supplier.country ?? "",
          pinCode: supplier.pinCode ?? "",
          paymentTerms: supplier.paymentTerms ?? "",
          leadTime: supplier.leadTime != null ? String(supplier.leadTime) : "",
          currency: supplier.currency ?? "",
          remarks: supplier.remarks ?? "",
          status: supplier.status,
        });
      } catch {
        setSubmitError("Could not load this supplier.");
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

    if (!form.supplierName.trim()) next.supplierName = "Supplier name is required";

    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = "Email must be a valid email address";
    }
    if (form.phone.trim() && !PHONE_REGEX.test(form.phone.trim())) {
      next.phone = "Phone must be 10-15 digits";
    }
    if (form.leadTime.trim()) {
      const parsed = Number(form.leadTime);
      if (Number.isNaN(parsed) || parsed < 0) next.leadTime = "Lead time cannot be negative";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError("");
    if (!validate()) return;

    const payload: SupplierPayload = {
      supplierName: form.supplierName.trim(),
      gstNumber: form.gstNumber.trim() || undefined,
      panNumber: form.panNumber.trim() || undefined,
      contactPerson: form.contactPerson.trim() || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      website: form.website.trim() || undefined,
      address: form.address.trim() || undefined,
      city: form.city.trim() || undefined,
      state: form.state.trim() || undefined,
      country: form.country.trim() || undefined,
      pinCode: form.pinCode.trim() || undefined,
      paymentTerms: form.paymentTerms.trim() || undefined,
      leadTime: form.leadTime.trim() ? Number(form.leadTime) : undefined,
      currency: form.currency.trim() || undefined,
      remarks: form.remarks.trim() || undefined,
      status: form.status,
    };

    setSubmitting(true);
    try {
      if (isEdit && id) {
        await updateSupplier(id, payload);
        toast.success("Supplier updated successfully.");
        navigate(`/suppliers/${id}`);
      } else {
        const created = await createSupplier(payload);
        toast.success("Supplier created successfully.");
        navigate(`/suppliers/${created.id}`);
      }
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        "Something went wrong while saving this supplier. Please try again.";
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
        <Topbar title={isEdit ? "Edit Supplier" : "Add Supplier"} />
        <main className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Spinner /> Loading supplier...
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mx-auto max-w-4xl space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Basic Information</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {isEdit && (
                    <div className="space-y-2">
                      <Label>Supplier Code</Label>
                      <Input value={supplierCode ?? ""} disabled />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="supplierName">Supplier Name *</Label>
                    <Input
                      id="supplierName"
                      value={form.supplierName}
                      onChange={(e) => update("supplierName", e.target.value)}
                      placeholder="Tata Steel Ltd."
                    />
                    {errors.supplierName && (
                      <p className="text-xs text-destructive">{errors.supplierName}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="gstNumber">GST Number</Label>
                    <Input
                      id="gstNumber"
                      value={form.gstNumber}
                      onChange={(e) => update("gstNumber", e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="panNumber">PAN Number</Label>
                    <Input
                      id="panNumber"
                      value={form.panNumber}
                      onChange={(e) => update("panNumber", e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select
                      id="status"
                      value={form.status}
                      onChange={(e) => update("status", e.target.value as SupplierStatus)}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Contact Information</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="contactPerson">Contact Person</Label>
                    <Input
                      id="contactPerson"
                      value={form.contactPerson}
                      onChange={(e) => update("contactPerson", e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
                    {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
                    {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      value={form.website}
                      onChange={(e) => update("website", e.target.value)}
                      placeholder="https://"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Address</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="address">Address</Label>
                    <Textarea
                      id="address"
                      value={form.address}
                      onChange={(e) => update("address", e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input id="city" value={form.city} onChange={(e) => update("city", e.target.value)} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input id="state" value={form.state} onChange={(e) => update("state", e.target.value)} />
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
                    <Label htmlFor="pinCode">PIN Code</Label>
                    <Input
                      id="pinCode"
                      value={form.pinCode}
                      onChange={(e) => update("pinCode", e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Commercial Terms</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="paymentTerms">Payment Terms</Label>
                    <Input
                      id="paymentTerms"
                      value={form.paymentTerms}
                      onChange={(e) => update("paymentTerms", e.target.value)}
                      placeholder="Net 30"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="leadTime">Lead Time (days)</Label>
                    <Input
                      id="leadTime"
                      inputMode="numeric"
                      value={form.leadTime}
                      onChange={(e) => update("leadTime", e.target.value)}
                    />
                    {errors.leadTime && <p className="text-xs text-destructive">{errors.leadTime}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="currency">Currency</Label>
                    <Input
                      id="currency"
                      value={form.currency}
                      onChange={(e) => update("currency", e.target.value)}
                      placeholder="INR"
                    />
                  </div>

                  <div className="space-y-2 sm:col-span-3">
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
                  {submitting ? "Saving..." : isEdit ? "Save Changes" : "Add Supplier"}
                </Button>
              </div>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}
