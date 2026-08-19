import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { listPermissions } from "@/api/permissions";
import type { Permission, Role } from "@/types";
import type { RolePayload } from "@/api/roles";

interface RoleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: Role | null;
  onSubmit: (payload: RolePayload) => Promise<void>;
}

interface FormState {
  name: string;
  description: string;
  permissionIds: Set<string>;
}

const emptyForm: FormState = { name: "", description: "", permissionIds: new Set() };

export default function RoleFormDialog({
  open,
  onOpenChange,
  role,
  onSubmit,
}: RoleFormDialogProps) {
  const isEdit = !!role;
  const [form, setForm] = useState<FormState>(emptyForm);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [nameError, setNameError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingPermissions, setLoadingPermissions] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      role
        ? {
            name: role.name,
            description: role.description ?? "",
            permissionIds: new Set((role.permissions ?? []).map((rp) => rp.permission.id)),
          }
        : emptyForm
    );
    setNameError("");
    setSubmitError("");

    setLoadingPermissions(true);
    listPermissions()
      .then(setAllPermissions)
      .catch(() => setSubmitError("Failed to load the permission catalog."))
      .finally(() => setLoadingPermissions(false));
  }, [open, role]);

  // Grouped by module so the checklist reads like the Permissions screen —
  // one section per module, with a "select all" toggle for that module.
  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, Permission[]>();
    for (const permission of allPermissions) {
      const list = groups.get(permission.module) ?? [];
      list.push(permission);
      groups.set(permission.module, list);
    }
    return Array.from(groups.entries());
  }, [allPermissions]);

  function togglePermission(id: string) {
    setForm((prev) => {
      const next = new Set(prev.permissionIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, permissionIds: next };
    });
  }

  function toggleModule(modulePermissions: Permission[], selectAll: boolean) {
    setForm((prev) => {
      const next = new Set(prev.permissionIds);
      for (const p of modulePermissions) {
        if (selectAll) next.add(p.id);
        else next.delete(p.id);
      }
      return { ...prev, permissionIds: next };
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError("");
    if (!form.name.trim()) {
      setNameError("Role name is required");
      return;
    }
    setNameError("");

    setSubmitting(true);
    try {
      await onSubmit({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        permissionIds: Array.from(form.permissionIds),
      });
      onOpenChange(false);
    } catch {
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Role" : "Add Role"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the role's name and permissions below."
              : "Create a role and choose the permissions it grants."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="roleName">Name *</Label>
              <Input
                id="roleName"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              {nameError && <p className="text-xs text-destructive">{nameError}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="roleDescription">Description</Label>
              <Input
                id="roleDescription"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Permissions</Label>
            <div className="max-h-72 overflow-y-auto rounded-md border p-3">
              {loadingPermissions ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Loading permissions...
                </p>
              ) : (
                <div className="space-y-3">
                  {groupedPermissions.map(([module, items]) => {
                    const allSelected = items.every((p) => form.permissionIds.has(p.id));
                    return (
                      <div key={module}>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-900">{module}</span>
                          <button
                            type="button"
                            className="text-xs text-primary hover:underline"
                            onClick={() => toggleModule(items, !allSelected)}
                          >
                            {allSelected ? "Clear all" : "Select all"}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          {items.map((permission) => (
                            <label
                              key={permission.id}
                              className="flex items-center gap-1.5 text-sm text-slate-700"
                            >
                              <Checkbox
                                checked={form.permissionIds.has(permission.id)}
                                onChange={() => togglePermission(permission.id)}
                              />
                              {permission.action}
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {submitError && <p className="text-sm text-destructive">{submitError}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : isEdit ? "Save Changes" : "Add Role"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
