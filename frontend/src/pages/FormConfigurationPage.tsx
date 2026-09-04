import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ChevronDown, Copy, Plus, RefreshCw, Trash2 } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import {
  createFormDefinition,
  createFormSubjectRoute,
  createFormVersion,
  createFormWebsite,
  createFormWebsiteProduct,
  deleteFormSubjectRoute,
  deleteFormWebsiteProduct,
  listFormSubjectRoutes,
  listFormWebsiteProducts,
  listFormWebsites,
  updateFormDefinition,
  updateFormSubjectRoute,
  updateFormWebsite,
  updateFormWebsiteProduct,
} from "@/api/form-websites";
import { listProducts } from "@/api/products";
import { listDepartments } from "@/api/departments";
import { listAssignableUsers } from "@/api/users";
import type {
  AssignableUser,
  Department,
  FormDefinition,
  FormDestinationType,
  FormFieldSchema,
  FormSubjectRoute,
  FormVersion,
  FormWebsite,
  FormWebsiteProduct,
  Product,
} from "@/types";

type FieldType = FormFieldSchema["type"];
// Plain-language labels for the underlying schema types — nobody filling
// out this screen needs to know the words "string"/"boolean".
const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  string: "Text",
  number: "Number",
  boolean: "Yes / No",
};
const FIELD_TYPES: FieldType[] = ["string", "number", "boolean"];

// UI convenience default only — mirrors backend's
// public-forms/subject-codes.constants.ts CANONICAL_SUBJECT_CODES. A custom
// code is always allowed; this just pre-fills the combobox for the common
// ones so nobody has to remember/retype them.
const CANONICAL_SUBJECT_CODES: { code: string; label: string; defaultDestination: FormDestinationType }[] = [
  { code: "WARRANTY_CLAIM", label: "Warranty Claim", defaultDestination: "COMPLAINT" },
  { code: "SERVICE_REQUEST", label: "Service Request", defaultDestination: "COMPLAINT" },
  { code: "REPAIR_REQUEST", label: "Repair Request", defaultDestination: "COMPLAINT" },
  { code: "TECHNICAL_SUPPORT", label: "Technical Support", defaultDestination: "COMPLAINT" },
  { code: "PRODUCT_ENQUIRY", label: "Product Enquiry", defaultDestination: "LEAD" },
  { code: "REQUEST_QUOTATION", label: "Request a Quotation", defaultDestination: "LEAD" },
  { code: "PROJECT_ENQUIRY", label: "Project Enquiry", defaultDestination: "LEAD" },
  { code: "DEALERSHIP_ENQUIRY", label: "Dealership Enquiry", defaultDestination: "LEAD" },
  { code: "GENERAL_ENQUIRY", label: "General Enquiry", defaultDestination: "LEAD" },
];

interface FieldRow {
  name: string;
  type: FieldType;
  required: boolean;
}

function schemaToFieldRows(version?: FormVersion | null): FieldRow[] {
  if (!version) return [];
  return Object.entries(version.schema.fields ?? {}).map(([name, def]) => ({
    name,
    type: def.type,
    required: !!def.required,
  }));
}

function fieldRowsToSchema(rows: FieldRow[]) {
  const fields: Record<string, FormFieldSchema> = {};
  for (const row of rows) {
    const name = row.name.trim();
    if (!name) continue;
    fields[name] = { type: row.type, required: row.required };
  }
  return { fields };
}

// Non-coder-friendly builder for a form's field list — no JSON is ever
// shown to the person configuring a form. Used both for creating a new
// version (editable) and for viewing the current published version
// (read-only) so the same field names/types/required flags render
// identically in both places.
function FieldsEditor({
  rows,
  onChange,
  readOnly = false,
}: {
  rows: FieldRow[];
  onChange?: (rows: FieldRow[]) => void;
  readOnly?: boolean;
}) {
  function updateRow(index: number, patch: Partial<FieldRow>) {
    if (!onChange) return;
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeRow(index: number) {
    if (!onChange) return;
    onChange(rows.filter((_, i) => i !== index));
  }

  function addRow() {
    if (!onChange) return;
    onChange([...rows, { name: "", type: "string", required: false }]);
  }

  if (rows.length === 0 && readOnly) {
    return <p className="text-sm text-muted-foreground">No fields defined.</p>;
  }

  return (
    <div className="space-y-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Field Name</TableHead>
            <TableHead className="w-36">Type</TableHead>
            <TableHead className="w-24">Required</TableHead>
            {!readOnly && <TableHead className="w-10" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={index}>
              <TableCell>
                {readOnly ? (
                  row.name
                ) : (
                  <Input
                    placeholder="e.g. fullName"
                    value={row.name}
                    onChange={(e) => updateRow(index, { name: e.target.value })}
                  />
                )}
              </TableCell>
              <TableCell>
                {readOnly ? (
                  FIELD_TYPE_LABELS[row.type]
                ) : (
                  <Select value={row.type} onChange={(e) => updateRow(index, { type: e.target.value as FieldType })}>
                    {FIELD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {FIELD_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </Select>
                )}
              </TableCell>
              <TableCell>
                {readOnly ? (
                  row.required ? "Yes" : "No"
                ) : (
                  <Checkbox
                    checked={row.required}
                    onChange={(e) => updateRow(index, { required: e.target.checked })}
                    aria-label={`${row.name || "Field"} is required`}
                  />
                )}
              </TableCell>
              {!readOnly && (
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => removeRow(index)} title="Remove field">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!readOnly && (
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="mr-2 h-3.5 w-3.5" />
          Add Field
        </Button>
      )}
    </div>
  );
}

function NewWebsiteDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setCode("");
      setName("");
      setSupportEmail("");
      setError("");
    }
  }, [open]);

  async function handleSubmit() {
    setSubmitting(true);
    setError("");
    try {
      await createFormWebsite({ code: code.trim(), name: name.trim(), supportEmail: supportEmail.trim() || undefined });
      toast.success("Website created.");
      onOpenChange(false);
      onCreated();
    } catch {
      setError("Could not create the website. Check that the code is unique.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Add Website</DialogTitle>
          <DialogDescription>Register a new external website whose forms will feed into DailyOps.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="website-code">Code</Label>
            <Input id="website-code" placeholder="PRODUCT_A" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="website-name">Name</Label>
            <Input id="website-name" placeholder="SPYRO" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="website-email">Support Email</Label>
            <Input
              id="website-email"
              placeholder="info@spyro.com"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
            />
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !code.trim() || !name.trim()}>
            {submitting && <Spinner className="mr-2 h-4 w-4" />}
            {submitting ? "Creating..." : "Create Website"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewFormDialog({
  open,
  onOpenChange,
  websiteId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  websiteId: string | null;
  onCreated: () => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [rows, setRows] = useState<FieldRow[]>([{ name: "", type: "string", required: false }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setCode("");
      setName("");
      setRows([{ name: "", type: "string", required: false }]);
      setError("");
    }
  }, [open]);

  async function handleSubmit() {
    if (!websiteId) return;
    const names = rows.map((r) => r.name.trim()).filter(Boolean);
    if (new Set(names).size !== names.length) {
      setError("Field names must be unique.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const form = await createFormDefinition(websiteId, { code: code.trim(), name: name.trim() });
      // Fields are optional at creation time (a form can be configured
      // later from "Edit Fields"), so only publish a version when at least
      // one field actually has a name.
      if (names.length > 0) {
        await createFormVersion(websiteId, form.id, { schema: fieldRowsToSchema(rows), publish: true });
      }
      toast.success("Form created.");
      onOpenChange(false);
      onCreated();
    } catch {
      setError("Could not create the form. Check that the code is unique for this website.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Form</DialogTitle>
          <DialogDescription>
            A public key will be generated automatically. Add the fields this form should collect — you can change
            them later from "Edit Fields".
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="form-code">Code</Label>
              <Input id="form-code" placeholder="CONTACT_FORM" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="form-name">Name</Label>
              <Input id="form-name" placeholder="Contact Form" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Fields</Label>
            <FieldsEditor rows={rows} onChange={setRows} />
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !code.trim() || !name.trim()}>
            {submitting && <Spinner className="mr-2 h-4 w-4" />}
            {submitting ? "Creating..." : "Create Form"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewVersionDialog({
  open,
  onOpenChange,
  target,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: { websiteId: string; formId: string; formName: string; currentVersion?: FormVersion } | null;
  onCreated: () => void;
}) {
  const [rows, setRows] = useState<FieldRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      // Pre-fill from the form's current fields so editing an existing form
      // means tweaking a list, not starting from a blank sheet — new/removed
      // fields are what actually changed, not the whole schema.
      const existing = schemaToFieldRows(target?.currentVersion);
      setRows(existing.length > 0 ? existing : [{ name: "", type: "string", required: false }]);
      setError("");
    }
  }, [open, target]);

  async function handleSubmit() {
    if (!target) return;
    const names = rows.map((r) => r.name.trim()).filter(Boolean);
    if (names.length === 0) {
      setError("Add at least one field.");
      return;
    }
    if (new Set(names).size !== names.length) {
      setError("Field names must be unique.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await createFormVersion(target.websiteId, target.formId, {
        schema: fieldRowsToSchema(rows),
        publish: true,
      });
      toast.success("New form version published.");
      onOpenChange(false);
      onCreated();
    } catch {
      setError("Could not publish the new version. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!target) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Fields — {target.formName}</DialogTitle>
          <DialogDescription>
            Publishing saves this as a new version — it never changes the version past submissions were recorded
            against, so old submissions always show exactly the fields that were live when they were submitted.
          </DialogDescription>
        </DialogHeader>

        <FieldsEditor rows={rows} onChange={setRows} />

        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Spinner className="mr-2 h-4 w-4" />}
            {submitting ? "Publishing..." : "Publish Version"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FormRow({
  form,
  onToggleEnabled,
  onEditFields,
}: {
  form: FormDefinition;
  onToggleEnabled: (form: FormDefinition) => void;
  onEditFields: (form: FormDefinition) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const latestPublished = (form.versions ?? [])
    .filter((v) => v.publishedAt)
    .sort((a, b) => b.version - a.version)[0];
  const fieldRows = schemaToFieldRows(latestPublished);

  function copyKey() {
    navigator.clipboard?.writeText(form.publicFormKey);
    toast.success("Public form key copied.");
  }

  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="flex items-center gap-2 text-left"
          onClick={() => setExpanded((v) => !v)}
        >
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
          <div>
            <p className="text-sm font-medium text-slate-900">{form.name}</p>
            <span
              onClick={(e) => {
                e.stopPropagation();
                copyKey();
              }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-slate-700"
              title="Copy public form key"
            >
              {form.publicFormKey}
              <Copy className="h-3 w-3" />
            </span>
          </div>
        </button>
        <div className="flex items-center gap-2">
          <Badge variant={form.enabled ? "success" : "muted"}>{form.enabled ? "Enabled" : "Disabled"}</Badge>
          <Badge variant={latestPublished ? "info" : "warning"}>
            {latestPublished ? `v${latestPublished.version} · ${fieldRows.length} field${fieldRows.length === 1 ? "" : "s"}` : "No fields yet"}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => onEditFields(form)}>
            Edit Fields
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onToggleEnabled(form)}>
            {form.enabled ? "Disable" : "Enable"}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 border-t pt-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Current form fields
          </p>
          <FieldsEditor rows={fieldRows} readOnly />
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------
// Websites & Forms panel
// -------------------------------------------------------------------

function WebsitesFormsPanel({ websites, loading, error, onRefresh }: {
  websites: FormWebsite[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
}) {
  const [newWebsiteOpen, setNewWebsiteOpen] = useState(false);
  const [newFormWebsiteId, setNewFormWebsiteId] = useState<string | null>(null);
  const [versionTarget, setVersionTarget] = useState<{
    websiteId: string;
    formId: string;
    formName: string;
    currentVersion?: FormVersion;
  } | null>(null);

  async function handleToggleWebsiteStatus(website: FormWebsite) {
    try {
      await updateFormWebsite(website.id, { status: website.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" });
      toast.success(`${website.name} is now ${website.status === "ACTIVE" ? "inactive" : "active"}.`);
      await onRefresh();
    } catch {
      toast.error("Could not update the website status.");
    }
  }

  async function handleToggleFormEnabled(websiteId: string, form: FormDefinition) {
    try {
      await updateFormDefinition(websiteId, form.id, { enabled: !form.enabled });
      toast.success(`${form.name} is now ${form.enabled ? "disabled" : "enabled"}.`);
      await onRefresh();
    } catch {
      toast.error("Could not update the form.");
    }
  }

  function openEditFields(websiteId: string, form: FormDefinition) {
    const currentVersion = (form.versions ?? []).filter((v) => v.publishedAt).sort((a, b) => b.version - a.version)[0];
    setVersionTarget({ websiteId, formId: form.id, formName: form.name, currentVersion });
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setNewWebsiteOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Website
        </Button>
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </span>
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Spinner /> Loading websites...
        </div>
      ) : websites.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No websites yet. Click "Add Website" to create one.
        </p>
      ) : (
        <div className="space-y-4">
          {websites.map((website) => (
            <Card key={website.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">{website.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">{website.code}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Button variant="outline" size="sm" onClick={() => setNewFormWebsiteId(website.id)}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add Form
                  </Button>
                  <div className="h-5 w-px bg-slate-200" aria-hidden="true" />
                  <Badge variant={website.status === "ACTIVE" ? "success" : "muted"}>{website.status}</Badge>
                  <Button variant="ghost" size="sm" onClick={() => handleToggleWebsiteStatus(website)}>
                    {website.status === "ACTIVE" ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {(website.forms ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No forms yet for this website.</p>
                ) : (
                  website.forms!.map((form) => (
                    <FormRow
                      key={form.id}
                      form={form}
                      onToggleEnabled={(f) => handleToggleFormEnabled(website.id, f)}
                      onEditFields={(f) => openEditFields(website.id, f)}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NewWebsiteDialog open={newWebsiteOpen} onOpenChange={setNewWebsiteOpen} onCreated={onRefresh} />
      <NewFormDialog
        open={!!newFormWebsiteId}
        onOpenChange={(open) => !open && setNewFormWebsiteId(null)}
        websiteId={newFormWebsiteId}
        onCreated={onRefresh}
      />
      <NewVersionDialog
        open={!!versionTarget}
        onOpenChange={(open) => !open && setVersionTarget(null)}
        target={versionTarget}
        onCreated={onRefresh}
      />
    </div>
  );
}

// -------------------------------------------------------------------
// Product Mappings panel
// -------------------------------------------------------------------

function ProductMappingDialog({
  open,
  onOpenChange,
  websiteId,
  mapping,
  products,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  websiteId: string | null;
  mapping: FormWebsiteProduct | null;
  products: Product[];
  onSaved: () => void;
}) {
  const [productId, setProductId] = useState("");
  const [publicCode, setPublicCode] = useState("");
  const [label, setLabel] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [displayOrder, setDisplayOrder] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setProductId(mapping?.productId ?? products[0]?.id ?? "");
      setPublicCode(mapping?.publicCode ?? "");
      setLabel(mapping?.label ?? "");
      setEnabled(mapping?.enabled ?? true);
      setDisplayOrder(mapping?.displayOrder ?? 0);
      setError("");
    }
  }, [open, mapping, products]);

  async function handleSubmit() {
    if (!websiteId) return;
    setSubmitting(true);
    setError("");
    try {
      if (mapping) {
        await updateFormWebsiteProduct(websiteId, mapping.id, {
          publicCode: publicCode.trim(),
          label: label.trim(),
          enabled,
          displayOrder,
        });
        toast.success("Product mapping updated.");
      } else {
        await createFormWebsiteProduct(websiteId, {
          productId,
          publicCode: publicCode.trim(),
          label: label.trim(),
          enabled,
          displayOrder,
        });
        toast.success("Product mapping added.");
      }
      onOpenChange(false);
      onSaved();
    } catch {
      setError("Could not save this mapping. Check that the public code is unique for this website.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>{mapping ? "Edit Product Mapping" : "Add Product Mapping"}</DialogTitle>
          <DialogDescription>Map this website's own product code/label onto a catalog Product.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="pm-product">Product</Label>
            <Select
              id="pm-product"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              disabled={!!mapping}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="pm-code">Public Code</Label>
              <Input id="pm-code" placeholder="SPYRO-24" value={publicCode} onChange={(e) => setPublicCode(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pm-order">Display Order</Label>
              <Input
                id="pm-order"
                type="number"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(parseInt(e.target.value, 10) || 0)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pm-label">Label</Label>
            <Input id="pm-label" placeholder="Spyro 24" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="pm-enabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <Label htmlFor="pm-enabled" className="mb-0">Enabled</Label>
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !productId || !publicCode.trim() || !label.trim()}>
            {submitting && <Spinner className="mr-2 h-4 w-4" />}
            {submitting ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProductMappingsPanel({ websites }: { websites: FormWebsite[] }) {
  const [websiteId, setWebsiteId] = useState<string>("");
  const [mappings, setMappings] = useState<FormWebsiteProduct[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState<FormWebsiteProduct | null>(null);

  useEffect(() => {
    if (!websiteId && websites.length > 0) setWebsiteId(websites[0].id);
  }, [websites, websiteId]);

  useEffect(() => {
    listProducts({ limit: 500 })
      .then((res) => setProducts(res.data.filter((p) => p.isActive)))
      .catch(() => toast.error("Failed to load products."));
  }, []);

  const fetchMappings = useCallback(async () => {
    if (!websiteId) {
      setMappings([]);
      return;
    }
    setLoading(true);
    try {
      const data = await listFormWebsiteProducts(websiteId);
      setMappings(data);
    } catch {
      toast.error("Failed to load product mappings.");
    } finally {
      setLoading(false);
    }
  }, [websiteId]);

  useEffect(() => {
    fetchMappings();
  }, [fetchMappings]);

  function openAdd() {
    setEditingMapping(null);
    setDialogOpen(true);
  }

  function openEdit(mapping: FormWebsiteProduct) {
    setEditingMapping(mapping);
    setDialogOpen(true);
  }

  async function handleToggleEnabled(mapping: FormWebsiteProduct) {
    try {
      await updateFormWebsiteProduct(websiteId, mapping.id, { enabled: !mapping.enabled });
      await fetchMappings();
    } catch {
      toast.error("Could not update the mapping.");
    }
  }

  async function handleDelete(mapping: FormWebsiteProduct) {
    try {
      await deleteFormWebsiteProduct(websiteId, mapping.id);
      toast.success("Product mapping removed.");
      await fetchMappings();
    } catch {
      toast.error("Could not remove this mapping.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-64 space-y-2">
          <Label htmlFor="pm-website">Website</Label>
          <Select id="pm-website" value={websiteId} onChange={(e) => setWebsiteId(e.target.value)}>
            {websites.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </div>
        <Button onClick={openAdd} disabled={!websiteId || products.length === 0}>
          <Plus className="mr-2 h-4 w-4" />
          Add Product Mapping
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Spinner /> Loading product mappings...
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Public Code</TableHead>
              <TableHead>Label</TableHead>
              <TableHead className="w-24">Enabled</TableHead>
              <TableHead className="w-28">Display Order</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mappings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No product mappings yet for this website.
                </TableCell>
              </TableRow>
            ) : (
              mappings.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{m.product?.name ?? "—"}</TableCell>
                  <TableCell>{m.publicCode}</TableCell>
                  <TableCell>{m.label}</TableCell>
                  <TableCell>
                    <Badge
                      variant={m.enabled ? "success" : "muted"}
                      className="cursor-pointer"
                      onClick={() => handleToggleEnabled(m)}
                    >
                      {m.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </TableCell>
                  <TableCell>{m.displayOrder}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(m)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(m)} title="Remove mapping">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      <ProductMappingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        websiteId={websiteId || null}
        mapping={editingMapping}
        products={products}
        onSaved={fetchMappings}
      />
    </div>
  );
}

// -------------------------------------------------------------------
// Subject Routing panel
// -------------------------------------------------------------------

interface FormOption {
  websiteId: string;
  websiteName: string;
  form: FormDefinition;
}

function SubjectRouteDialog({
  open,
  onOpenChange,
  formDefinitionId,
  route,
  products,
  departments,
  users,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formDefinitionId: string | null;
  route: FormSubjectRoute | null;
  products: Product[];
  departments: Department[];
  users: AssignableUser[];
  onSaved: () => void;
}) {
  const [subjectCode, setSubjectCode] = useState("");
  const [subjectLabel, setSubjectLabel] = useState("");
  const [destinationType, setDestinationType] = useState<FormDestinationType>("LEAD");
  const [productId, setProductId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [priority, setPriority] = useState(0);
  const [enabled, setEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setSubjectCode(route?.subjectCode ?? "");
      setSubjectLabel(route?.subjectLabel ?? "");
      setDestinationType(route?.destinationType ?? "LEAD");
      setProductId(route?.productId ?? "");
      setDepartmentId(route?.departmentId ?? "");
      setAssignedUserId(route?.assignedUserId ?? "");
      setPriority(route?.priority ?? 0);
      setEnabled(route?.enabled ?? true);
      setError("");
    }
  }, [open, route]);

  function handleCanonicalPick(code: string) {
    setSubjectCode(code);
    const canonical = CANONICAL_SUBJECT_CODES.find((c) => c.code === code);
    if (canonical) {
      setSubjectLabel(canonical.label);
      setDestinationType(canonical.defaultDestination);
    }
  }

  async function handleSubmit() {
    if (!formDefinitionId) return;
    setSubmitting(true);
    setError("");
    try {
      if (route) {
        await updateFormSubjectRoute(formDefinitionId, route.id, {
          subjectLabel: subjectLabel.trim(),
          destinationType,
          productId: productId || null,
          departmentId: departmentId || null,
          assignedUserId: assignedUserId || null,
          priority,
          enabled,
        });
        toast.success("Subject route updated.");
      } else {
        await createFormSubjectRoute(formDefinitionId, {
          subjectCode: subjectCode.trim(),
          subjectLabel: subjectLabel.trim(),
          destinationType,
          productId: productId || undefined,
          departmentId: departmentId || undefined,
          assignedUserId: assignedUserId || undefined,
          priority,
          enabled,
        });
        toast.success("Subject route added.");
      }
      onOpenChange(false);
      onSaved();
    } catch {
      setError("Could not save this route. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{route ? "Edit Subject Route" : "Add Subject Route"}</DialogTitle>
          <DialogDescription>
            Resolves a submitted subject (optionally scoped to one product) to a destination, with an optional
            default department/assignee.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="route-code">Subject Code</Label>
              <Input
                id="route-code"
                list="canonical-subject-codes"
                placeholder="GENERAL_ENQUIRY"
                value={subjectCode}
                onChange={(e) => handleCanonicalPick(e.target.value)}
                disabled={!!route}
              />
              <datalist id="canonical-subject-codes">
                {CANONICAL_SUBJECT_CODES.map((c) => (
                  <option key={c.code} value={c.code} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label htmlFor="route-label">Subject Label</Label>
              <Input
                id="route-label"
                placeholder="General Enquiry"
                value={subjectLabel}
                onChange={(e) => setSubjectLabel(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="route-destination">Destination</Label>
              <Select
                id="route-destination"
                value={destinationType}
                onChange={(e) => setDestinationType(e.target.value as FormDestinationType)}
              >
                <option value="LEAD">Lead</option>
                <option value="COMPLAINT">Complaint</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="route-priority">Priority</Label>
              <Input
                id="route-priority"
                type="number"
                value={priority}
                onChange={(e) => setPriority(parseInt(e.target.value, 10) || 0)}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="route-product">Product</Label>
              <Select id="route-product" value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">Any</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="route-department">Department</Label>
              <Select id="route-department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">None</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="route-user">Assigned User</Label>
              <Select id="route-user" value={assignedUserId} onChange={(e) => setAssignedUserId(e.target.value)}>
                <option value="">None</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="route-enabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <Label htmlFor="route-enabled" className="mb-0">Enabled</Label>
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !subjectCode.trim() || !subjectLabel.trim()}>
            {submitting && <Spinner className="mr-2 h-4 w-4" />}
            {submitting ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SubjectRoutingPanel({ websites }: { websites: FormWebsite[] }) {
  const formOptions: FormOption[] = useMemo(
    () =>
      websites.flatMap((w) => (w.forms ?? []).map((form) => ({ websiteId: w.id, websiteName: w.name, form }))),
    [websites],
  );
  const [formDefinitionId, setFormDefinitionId] = useState("");
  const [routes, setRoutes] = useState<FormSubjectRoute[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<FormSubjectRoute | null>(null);

  useEffect(() => {
    if (!formDefinitionId && formOptions.length > 0) setFormDefinitionId(formOptions[0].form.id);
  }, [formOptions, formDefinitionId]);

  useEffect(() => {
    listProducts({ limit: 500 })
      .then((res) => setProducts(res.data.filter((p) => p.isActive)))
      .catch(() => toast.error("Failed to load products."));
    listDepartments()
      .then(setDepartments)
      .catch(() => toast.error("Failed to load departments."));
    listAssignableUsers()
      .then(setUsers)
      .catch(() => toast.error("Failed to load assignable users."));
  }, []);

  const fetchRoutes = useCallback(async () => {
    if (!formDefinitionId) {
      setRoutes([]);
      return;
    }
    setLoading(true);
    try {
      const data = await listFormSubjectRoutes(formDefinitionId);
      setRoutes(data);
    } catch {
      toast.error("Failed to load subject routes.");
    } finally {
      setLoading(false);
    }
  }, [formDefinitionId]);

  useEffect(() => {
    fetchRoutes();
  }, [fetchRoutes]);

  function openAdd() {
    setEditingRoute(null);
    setDialogOpen(true);
  }

  function openEdit(route: FormSubjectRoute) {
    setEditingRoute(route);
    setDialogOpen(true);
  }

  async function handleToggleEnabled(route: FormSubjectRoute) {
    try {
      await updateFormSubjectRoute(formDefinitionId, route.id, { enabled: !route.enabled });
      await fetchRoutes();
    } catch {
      toast.error("Could not update this route.");
    }
  }

  async function handleDelete(route: FormSubjectRoute) {
    try {
      await deleteFormSubjectRoute(formDefinitionId, route.id);
      toast.success("Subject route removed.");
      await fetchRoutes();
    } catch {
      toast.error("Could not remove this route.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-72 space-y-2">
          <Label htmlFor="route-form">Form</Label>
          <Select id="route-form" value={formDefinitionId} onChange={(e) => setFormDefinitionId(e.target.value)}>
            {formOptions.map(({ websiteName, form }) => (
              <option key={form.id} value={form.id}>
                {websiteName} — {form.name}
              </option>
            ))}
          </Select>
        </div>
        <Button onClick={openAdd} disabled={!formDefinitionId}>
          <Plus className="mr-2 h-4 w-4" />
          Add Subject Route
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Spinner /> Loading subject routes...
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subject</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Assigned User</TableHead>
              <TableHead className="w-20">Priority</TableHead>
              <TableHead className="w-24">Enabled</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {routes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  No subject routes yet for this form.
                </TableCell>
              </TableRow>
            ) : (
              routes.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <p className="font-medium text-slate-900">{r.subjectLabel}</p>
                    <p className="text-xs text-muted-foreground">{r.subjectCode}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.destinationType === "LEAD" ? "info" : "warning"}>{r.destinationType}</Badge>
                  </TableCell>
                  <TableCell>{r.product?.name ?? "Any"}</TableCell>
                  <TableCell>{r.department?.name ?? "—"}</TableCell>
                  <TableCell>{r.assignedUser?.name ?? "—"}</TableCell>
                  <TableCell>{r.priority}</TableCell>
                  <TableCell>
                    <Badge
                      variant={r.enabled ? "success" : "muted"}
                      className="cursor-pointer"
                      onClick={() => handleToggleEnabled(r)}
                    >
                      {r.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(r)} title="Remove route">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      <SubjectRouteDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        formDefinitionId={formDefinitionId || null}
        route={editingRoute}
        products={products}
        departments={departments}
        users={users}
        onSaved={fetchRoutes}
      />
    </div>
  );
}

// -------------------------------------------------------------------
// Page
// -------------------------------------------------------------------

const SECTIONS = [
  { key: "websites", label: "Websites & Forms" },
  { key: "products", label: "Product Mappings" },
  { key: "routing", label: "Subject Routing" },
] as const;
type SectionKey = (typeof SECTIONS)[number]["key"];

export default function FormConfigurationPage() {
  const [websites, setWebsites] = useState<FormWebsite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [section, setSection] = useState<SectionKey>("websites");

  const fetchWebsites = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listFormWebsites({ limit: 100 });
      setWebsites(res.data);
    } catch {
      setError("Failed to load websites.");
      toast.error("Failed to load websites.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWebsites();
  }, [fetchWebsites]);

  return (
    <div className="flex h-screen bg-app-grid">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="Web Form Configuration" showBackButton />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-6xl space-y-4">
            <div className="inline-flex rounded-md border p-1">
              {SECTIONS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSection(s.key)}
                  className={cn(
                    "rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
                    section === s.key ? "bg-orange text-white" : "text-muted-foreground hover:text-slate-900",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {section === "websites" && (
              <WebsitesFormsPanel websites={websites} loading={loading} error={error} onRefresh={fetchWebsites} />
            )}
            {section === "products" &&
              (loading ? (
                <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                  <Spinner /> Loading...
                </div>
              ) : (
                <ProductMappingsPanel websites={websites} />
              ))}
            {section === "routing" &&
              (loading ? (
                <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                  <Spinner /> Loading...
                </div>
              ) : (
                <SubjectRoutingPanel websites={websites} />
              ))}
          </div>
        </main>
      </div>
    </div>
  );
}
