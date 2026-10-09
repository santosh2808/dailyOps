import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, Plus, Pencil, Ban, CheckCircle2, KeyRound, Trash2, X } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import UserFormDialog from "@/components/users/UserFormDialog";
import ResetPasswordDialog from "@/components/users/ResetPasswordDialog";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import TruncatedText from "@/components/shared/TruncatedText";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/errors";
import { useAuth } from "@/context/AuthContext";
import {
  createUser,
  deleteUser,
  deleteUserPermanently,
  listUsers,
  resetUserPassword,
  updateUser,
  type UserPayload,
} from "@/api/users";
import { getDepartment } from "@/api/departments";
import type { RbacUser } from "@/types";

const PAGE_SIZE = 20;

export default function Users() {
  const { user: currentUser } = useAuth();
  // QA fix: "Departments — clicking a department should navigate to the
  // Users page with the selected department automatically applied as a
  // filter." Mirrors the existing `/leads?status=QUALIFIED` Dashboard-card
  // pattern (see LeadList.tsx's initialFiltersFromSearchParams) — read once
  // on first mount, then this page's own state owns it from there.
  const [searchParams] = useSearchParams();
  const [departmentId, setDepartmentId] = useState<string | null>(
    () => searchParams.get("departmentId")
  );
  const [departmentName, setDepartmentName] = useState<string | null>(null);
  const [users, setUsers] = useState<RbacUser[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [enableOpen, setEnableOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<RbacUser | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listUsers({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        departmentId: departmentId || undefined,
      });
      setUsers(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err) {
      const message = getErrorMessage(err, "Failed to load users.");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [page, search, departmentId]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Resolve the filtered department's name for the banner below — the
  // incoming link only carries the id, same as assignedToUserId does on the
  // Leads filter.
  useEffect(() => {
    if (!departmentId) {
      setDepartmentName(null);
      return;
    }
    let cancelled = false;
    getDepartment(departmentId)
      .then((dept) => {
        if (!cancelled) setDepartmentName(dept.name);
      })
      .catch(() => {
        if (!cancelled) setDepartmentName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [departmentId]);

  function clearDepartmentFilter() {
    setDepartmentId(null);
    setPage(1);
  }

  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  function openAddDialog() {
    setSelected(null);
    setFormOpen(true);
  }

  function openEditDialog(user: RbacUser) {
    setSelected(user);
    setFormOpen(true);
  }

  function openDisableDialog(user: RbacUser) {
    setSelected(user);
    setDisableOpen(true);
  }

  // TC-071: same confirm-before-action pattern as Disable — Enable used to
  // fire immediately on click with no confirmation, unlike every other
  // confirm-before-action button in this app.
  function openEnableDialog(user: RbacUser) {
    setSelected(user);
    setEnableOpen(true);
  }

  function openResetDialog(user: RbacUser) {
    setSelected(user);
    setResetOpen(true);
  }

  // QA fix: "Delete User option is missing" — distinct from Disable above,
  // this permanently removes the user record (see deleteUserPermanently()).
  function openDeleteDialog(user: RbacUser) {
    setSelected(user);
    setDeleteOpen(true);
  }

  async function handleFormSubmit(payload: UserPayload & { password?: string }) {
    if (selected) {
      await updateUser(selected.id, payload);
    } else {
      await createUser(payload as UserPayload & { password: string });
    }
    await fetchUsers();
  }

  // Enabling a disabled user reuses the same update endpoint — there's no
  // separate "enable" route, just isActive: true.
  async function handleEnableConfirm() {
    if (!selected) return;
    await updateUser(selected.id, { isActive: true });
    toast.success(`User "${selected.name}" enabled.`);
    await fetchUsers();
  }

  async function handleDisableConfirm() {
    if (!selected) return;
    await deleteUser(selected.id);
    toast.success(`User "${selected.name}" disabled.`);
    await fetchUsers();
  }

  async function handleDeleteConfirm() {
    if (!selected) return;
    await deleteUserPermanently(selected.id);
    toast.success(`User "${selected.name}" permanently deleted.`);
    await fetchUsers();
  }

  async function handleResetSubmit(newPassword: string) {
    if (!selected) return;
    await resetUserPassword(selected.id, newPassword);
    await fetchUsers();
  }

  return (
    <div className="flex min-h-dvh bg-app-grid pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Topbar title="Users" />
        <main className="flex-1 p-6">
          {/* QA fix ("There is overlap on screen in complete app") — see
              LeadList.tsx's identical fix for the full reasoning. */}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, username, or email"
                className="pl-9"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <Button onClick={openAddDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add User
            </Button>
          </div>

          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

          {departmentId && (
            <div className="mb-3 flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-4 py-2">
              <p className="text-sm text-slate-700">
                Showing users in department:{" "}
                <span className="font-medium text-slate-900">
                  {departmentName ?? "…"}
                </span>
              </p>
              <Button variant="ghost" size="sm" onClick={clearDepartmentFilter}>
                <X className="mr-1 h-4 w-4" />
                Clear filter
              </Button>
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Spinner /> Loading users...
                    </span>
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No users found.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium text-slate-900">
                      <TruncatedText text={user.name} className="max-w-[160px]" />
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {user.username}
                    </TableCell>
                    <TableCell>
                      <TruncatedText text={user.email} />
                    </TableCell>
                    <TableCell>{user.department?.name ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.roles.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          user.roles.map(({ role }) => (
                            <Badge key={role.id} variant="orange">
                              {role.name}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.isActive ? "success" : "muted"}>
                        {user.isActive ? "Active" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Edit user"
                          onClick={() => openEditDialog(user)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Reset password"
                          onClick={() => openResetDialog(user)}
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        {/* QA fix (AD-003): an Administrator disabling their own
                            account would log them out with no other active
                            Administrator able to log back in and re-enable it.
                            Backend enforces this independently (users.service.ts
                            update()/remove()) — this is just defense-in-depth so
                            the button doesn't even look clickable on your own row. */}
                        {user.isActive ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            title={
                              user.id === currentUser?.id
                                ? "You can't disable your own account"
                                : "Disable user"
                            }
                            disabled={user.id === currentUser?.id}
                            onClick={() => openDisableDialog(user)}
                          >
                            <Ban className="h-4 w-4 text-destructive" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Enable user"
                            onClick={() => openEnableDialog(user)}
                          >
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          </Button>
                        )}
                        {/* QA fix: "Delete User option is missing" — a
                            genuinely permanent action, distinct from
                            Disable above. Same self-protection as Disable:
                            backend enforces this independently
                            (users.service.ts hardDelete()) — this is just
                            defense-in-depth. */}
                        <Button
                          variant="ghost"
                          size="icon"
                          title={
                            user.id === currentUser?.id
                              ? "You can't delete your own account"
                              : "Delete user"
                          }
                          disabled={user.id === currentUser?.id}
                          onClick={() => openDeleteDialog(user)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-sm text-muted-foreground">
              {total === 0
                ? "0 users"
                : `Showing ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, total)} of ${total} users`}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </main>
      </div>

      <UserFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        user={selected}
        onSubmit={handleFormSubmit}
      />
      <ResetPasswordDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        user={selected}
        onSubmit={handleResetSubmit}
      />
      <ConfirmDialog
        open={disableOpen}
        onOpenChange={setDisableOpen}
        title="Disable User"
        description={
          <>
            Are you sure you want to disable{" "}
            <span className="font-medium text-slate-900">{selected?.name}</span>? They
            will no longer be able to log in until re-enabled.
          </>
        }
        confirmLabel="Disable"
        confirmingLabel="Disabling..."
        errorMessage="Could not disable this user. Please try again."
        onConfirm={handleDisableConfirm}
      />
      <ConfirmDialog
        open={enableOpen}
        onOpenChange={setEnableOpen}
        title="Enable User"
        description={
          <>
            Enable{" "}
            <span className="font-medium text-slate-900">{selected?.name}</span>? They
            will regain access to the system.
          </>
        }
        confirmLabel="Enable"
        confirmingLabel="Enabling..."
        errorMessage="Could not enable this user. Please try again."
        onConfirm={handleEnableConfirm}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete User"
        description={
          <>
            Permanently delete{" "}
            <span className="font-medium text-slate-900">{selected?.name}</span>? This
            cannot be undone. Their role assignments will be removed, and any leads or
            complaints assigned to them will be unassigned — all other records they
            created remain unchanged.
          </>
        }
        confirmLabel="Delete"
        confirmingLabel="Deleting..."
        errorMessage="Could not delete this user. Please try again."
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
