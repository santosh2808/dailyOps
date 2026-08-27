import { useCallback, useEffect, useState } from "react";
import { Search, Plus, Pencil, Ban, CheckCircle2, KeyRound } from "lucide-react";
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
import {
  createUser,
  deleteUser,
  listUsers,
  resetUserPassword,
  updateUser,
  type UserPayload,
} from "@/api/users";
import type { RbacUser } from "@/types";

const PAGE_SIZE = 20;

export default function Users() {
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
  const [resetOpen, setResetOpen] = useState(false);
  const [selected, setSelected] = useState<RbacUser | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listUsers({ page, limit: PAGE_SIZE, search: search || undefined });
      setUsers(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch {
      setError("Failed to load users.");
      toast.error("Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

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

  function openResetDialog(user: RbacUser) {
    setSelected(user);
    setResetOpen(true);
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
  async function handleEnable(user: RbacUser) {
    await updateUser(user.id, { isActive: true });
    toast.success(`User "${user.name}" enabled.`);
    await fetchUsers();
  }

  async function handleDisableConfirm() {
    if (!selected) return;
    await deleteUser(selected.id);
    toast.success(`User "${selected.name}" disabled.`);
    await fetchUsers();
  }

  async function handleResetSubmit(newPassword: string) {
    if (!selected) return;
    await resetUserPassword(selected.id, newPassword);
    await fetchUsers();
  }

  return (
    <div className="flex h-screen bg-app-grid">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="Users" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                        {user.isActive ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Disable user"
                            onClick={() => openDisableDialog(user)}
                          >
                            <Ban className="h-4 w-4 text-destructive" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Enable user"
                            onClick={() => handleEnable(user)}
                          >
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          </Button>
                        )}
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
    </div>
  );
}
