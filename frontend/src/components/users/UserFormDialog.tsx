import { useEffect, useState, type FormEvent } from "react";
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
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { listDepartments } from "@/api/departments";
import { listRoles } from "@/api/roles";
import type { RbacUser, Department, Role } from "@/types";
import type { UserPayload } from "@/api/users";

// This one dialog covers three of the spec's screens at once: User
// Management (name/username/email, plus initial password on create), Role
// Assignment (the roleIds checklist), and Department Assignment (the
// department select) — all are fields on the same PATCH/POST to
// /api/v1/users. Resetting an existing user's password is a separate,
// dedicated action (see ResetPasswordDialog) — this form never touches
// password on edit.
interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: RbacUser | null;
  onSubmit: (payload: UserPayload & { password?: string }) => Promise<void>;
}

interface FormState {
  name: string;
  username: string;
  email: string;
  password: string;
  departmentId: string;
  roleIds: Set<string>;
  isActive: boolean;
}

const emptyForm: FormState = {
  name: "",
  username: "",
  email: "",
  password: "",
  departmentId: "",
  roleIds: new Set(),
  isActive: true,
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_.]{3,32}$/;

export default function UserFormDialog({
  open,
  onOpenChange,
  user,
  onSubmit,
}: UserFormDialogProps) {
  const isEdit = !!user;
  const [form, setForm] = useState<FormState>(emptyForm);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      user
        ? {
            name: user.name,
            username: user.username,
            email: user.email,
            password: "",
            departmentId: user.departmentId ?? "",
            roleIds: new Set(user.roles.map((r) => r.role.id)),
            isActive: user.isActive,
          }
        : emptyForm
    );
    setErrors({});
    setSubmitError("");

    setLoadingOptions(true);
    Promise.all([listDepartments(), listRoles()])
      .then(([deps, rls]) => {
        setDepartments(deps);
        setRoles(rls);
      })
      .catch(() => setSubmitError("Failed to load departments/roles."))
      .finally(() => setLoadingOptions(false));
  }, [open, user]);

  function toggleRole(id: string) {
    setForm((prev) => {
      const next = new Set(prev.roleIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, roleIds: next };
    });
  }

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) next.name = "Name is required";
    if (!form.username.trim()) {
      next.username = "Username is required";
    } else if (!USERNAME_REGEX.test(form.username.trim())) {
      next.username = "3-32 characters: letters, numbers, dot, underscore only";
    }
    if (!form.email.trim()) next.email = "Email is required";
    else if (!EMAIL_REGEX.test(form.email.trim())) next.email = "Enter a valid email address";
    if (!isEdit && form.password.length < 6) {
      next.password = "Password must be at least 6 characters";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError("");
    if (!validate()) return;

    setSubmitting(true);
    try {
      const payload: UserPayload & { password?: string } = {
        name: form.name.trim(),
        username: form.username.trim(),
        email: form.email.trim(),
        departmentId: form.departmentId || undefined,
        roleIds: Array.from(form.roleIds),
      };
      // Password is only ever sent on create — the user must change this
      // temporary password on first login. Edit never touches it (use
      // Reset Password for that).
      if (!isEdit) payload.password = form.password;
      if (isEdit) payload.isActive = form.isActive;

      await onSubmit(payload);
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
          <DialogTitle>{isEdit ? "Edit User" : "Add User"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the user's details, roles, and department below. Use Reset Password to set a new password."
              : "Create a user and assign their roles and department. They'll be required to change this temporary password on first login."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="userName">Name *</Label>
              <Input
                id="userName"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="userUsername">Username *</Label>
              <Input
                id="userUsername"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="jane.doe"
              />
              {errors.username && <p className="text-xs text-destructive">{errors.username}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="userEmail">Email *</Label>
              <Input
                id="userEmail"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="userDepartment">Department</Label>
              <Select
                id="userDepartment"
                value={form.departmentId}
                onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
              >
                <option value="">No department</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {!isEdit && (
            <div className="space-y-2">
              <Label htmlFor="userPassword">Initial Password *</Label>
              <Input
                id="userPassword"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password}</p>
              )}
            </div>
          )}

          {isEdit && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <Checkbox
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              Active
            </label>
          )}

          <div className="space-y-2">
            <Label>Roles</Label>
            <div className="max-h-48 overflow-y-auto rounded-md border p-3">
              {loadingOptions ? (
                <p className="py-2 text-center text-sm text-muted-foreground">
                  Loading roles...
                </p>
              ) : roles.length === 0 ? (
                <p className="py-2 text-center text-sm text-muted-foreground">
                  No roles available. Create one on the Roles screen first.
                </p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {roles.map((role) => (
                    <label key={role.id} className="flex items-center gap-1.5 text-sm text-slate-700">
                      <Checkbox
                        checked={form.roleIds.has(role.id)}
                        onChange={() => toggleRole(role.id)}
                      />
                      {role.name}
                    </label>
                  ))}
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
              {submitting ? "Saving..." : isEdit ? "Save Changes" : "Add User"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
