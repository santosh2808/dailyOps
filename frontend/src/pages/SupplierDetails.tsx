import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, RefreshCw, Trash2 } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SupplierStatusBadge from "@/components/suppliers/SupplierStatusBadge";
import DeleteSupplierConfirmDialog from "@/components/suppliers/DeleteSupplierConfirmDialog";
import { deleteSupplier, getSupplier } from "@/api/suppliers";
import type { Supplier } from "@/types";

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
  return new Date(value).toLocaleDateString();
}

export default function SupplierDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const fetchSupplier = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const data = await getSupplier(id);
      setSupplier(data);
    } catch {
      setError("Could not load this supplier.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchSupplier();
  }, [fetchSupplier]);

  async function handleDeleteConfirm() {
    if (!id) return;
    await deleteSupplier(id);
    navigate("/suppliers");
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="Supplier Details" />
        <main className="flex-1 overflow-y-auto p-6">
          <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate("/suppliers")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Suppliers
          </Button>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading supplier...</p>
          ) : error || !supplier ? (
            <div className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <span>{error || "Supplier not found."}</span>
              <Button variant="outline" size="sm" onClick={fetchSupplier}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          ) : (
            <div className="mx-auto max-w-4xl space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">{supplier.supplierCode}</h2>
                  <p className="text-sm text-muted-foreground">{supplier.supplierName}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => navigate(`/suppliers/${supplier.id}/edit`)}>
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
                  <CardTitle className="text-base">Basic Information</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <Field label="Supplier Code" value={supplier.supplierCode} />
                  <Field label="Supplier Name" value={supplier.supplierName} />
                  <Field label="Status" value={<SupplierStatusBadge status={supplier.status} />} />
                  <Field label="GST Number" value={supplier.gstNumber} />
                  <Field label="PAN Number" value={supplier.panNumber} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Contact Information</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <Field label="Contact Person" value={supplier.contactPerson} />
                  <Field label="Phone" value={supplier.phone} />
                  <Field label="Email" value={supplier.email} />
                  <Field label="Website" value={supplier.website} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Address</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <Field label="Address" value={supplier.address} />
                  <Field label="City" value={supplier.city} />
                  <Field label="State" value={supplier.state} />
                  <Field label="Country" value={supplier.country} />
                  <Field label="PIN Code" value={supplier.pinCode} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Commercial Terms</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <Field label="Payment Terms" value={supplier.paymentTerms} />
                  <Field label="Lead Time" value={supplier.leadTime != null ? `${supplier.leadTime} days` : null} />
                  <Field label="Currency" value={supplier.currency} />
                  <Field label="Created" value={formatDate(supplier.createdAt)} />
                  <Field label="Last Updated" value={formatDate(supplier.updatedAt)} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Remarks</CardTitle>
                </CardHeader>
                <CardContent>
                  <Field label="Remarks" value={supplier.remarks} />
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </div>

      <DeleteSupplierConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        supplier={supplier}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
