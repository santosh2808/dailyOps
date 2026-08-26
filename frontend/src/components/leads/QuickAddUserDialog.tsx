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
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { listDepartments } from "@/api/departments";
import { listRoles } from "@/api/roles";
import { quickCreateUser } from "@/api/users";
import type { Department, RbacUser, Role } from "@/types";

// Lead Assignment "+ Add User" modal (requirements #4-6). Deliberately a
// smaller field set than the full Administration -> Users form
// (UserFormDialog): no username or password — the backend auto-generates
// both (see UsersService.quickCreate()) and forces mustChangePassword, so
// every existing User invariant still holds. Role is a single select,
// restricted to Sales Executive / Sales Manager, since this modal exists
// only to populate the Lead Assignment dropdown.
const ASSIGNABLE_ROLE_NAMES = ["Sales Executive", "Sales Manager"];

interface QuickAddUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (user: RbacUser) => void;
}

interface FormState {
  name: string;
  email: string;
  phone: string;
  departmentId: string;
  roleId: string;
  isActive: boolean;
}

const emptyForm: FormState = {
  name: "",
  email: "",
  phone: "",
  departmentId: "",
  roleId: "",
  isActive: true,
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function QuickAddUserDialog({
  open,
  onOpenChange,
  onCreated,
}: QuickAddUserDialogProps) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const assignableRoles = roles.filter((r) => ASSIGNABLE_ROLE_NAMES.includes(r.name));

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm);
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
  }, [open]);

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) next.name = "Full name is required";
    if (!form.email.trim()) next.email = "Email is required";
    else if (!EMAIL_REGEX.test(form.email.trim())) next.email = "Enter a valid email address";
    if (!form.roleId) next.roleId = "Role is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError("");
    if (!validate()) return;

    setSubmitting(true);
    try {
      const user = await quickCreateUser({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        departmentId: form.departmentId || undefined,
        roleId: form.roleId,
        isActive: form.isActive,
      });
      toast.success("User created successfully.");
      onCreated(user);
    } catch {
      const message =
        "Could not create this user. The email may already be in use — please try again.";
      setSubmitError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Add User</DialogTitle>
          <DialogDescription>
            Create a Sales Executive or Sales Manager so they can be assigned to leads. A
            username and temporary password are generated automatically; use Reset Password
            from Administration → Users if they need to log in themselves.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="quickUserName">Full Name *</Label>
            <Input
              id="quickUserName"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quickUserEmail">Email *</Label>
              <Input
                id="quickUserEmail"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="quickUserPhone">Phone</Label>
              <Input
                id="quickUserPhone"
                inputMode="numeric"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quickUserDepartment">Department</Label>
              <Select
                id="quickUserDepartment"
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
            <div className="space-y-2">
              <Label htmlFor="quickUserRole">Role *</Label>
              <Select
                id="quickUserRole"
                value={form.roleId}
                onChange={(e) => setForm({ ...form, roleId: e.target.value })}
              >
                <option value="">
                  {loadingOptions ? "Loading roles..." : "Select a role"}
                </option>
                {assignableRoles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </Select>
              {errors.roleId && <p className="text-xs text-destructive">{errors.roleId}</p>}
              {!loadingOptions && assignableRoles.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No Sales Executive/Sales Manager role found — create one on the Roles screen
                  first.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quickUserStatus">Status</Label>
            <Select
              id="quickUserStatus"
              value={form.isActive ? "active" : "disabled"}
              onChange={(e) => setForm({ ...form, isActive: e.target.value === "active" })}
            >
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </Select>
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
            <Button type="submit" disabled={submitting || loadingOptions}>
              {submitting && <Spinner className="mr-2 h-4 w-4" />}
              {submitting ? "Creating..." : "Add User"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
