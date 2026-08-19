import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import RoleFormDialog from "@/components/roles/RoleFormDialog";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { createRole, deleteRole, listRoles, updateRole, type RolePayload } from "@/api/roles";
import type { Role } from "@/types";

export default function Roles() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<Role | null>(null);

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRoles(await listRoles());
    } catch {
      setError("Failed to load roles.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  function openAddDialog() {
    setSelected(null);
    setFormOpen(true);
  }

  function openEditDialog(role: Role) {
    setSelected(role);
    setFormOpen(true);
  }

  function openDeleteDialog(role: Role) {
    setSelected(role);
    setDeleteOpen(true);
  }

  async function handleFormSubmit(payload: RolePayload) {
    if (selected) {
      await updateRole(selected.id, payload);
    } else {
      await createRole(payload);
    }
    await fetchRoles();
  }

  async function handleDeleteConfirm() {
    if (!selected) return;
    await deleteRole(selected.id);
    await fetchRoles();
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="Roles" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Editing a role's permissions here changes access for every user assigned
              to it, immediately.
            </p>
            <Button onClick={openAddDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add Role
            </Button>
          </div>

          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead>Users</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Loading roles...
                  </TableCell>
                </TableRow>
              ) : roles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No roles found.
                  </TableCell>
                </TableRow>
              ) : (
                roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell className="font-medium text-slate-900">{role.name}</TableCell>
                    <TableCell>{role.description || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="orange">{role.permissions?.length ?? 0}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="muted">{role._count?.users ?? 0}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Edit role"
                          onClick={() => openEditDialog(role)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Delete role"
                          onClick={() => openDeleteDialog(role)}
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
        </main>
      </div>

      <RoleFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        role={selected}
        onSubmit={handleFormSubmit}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Role"
        description={
          <>
            Are you sure you want to delete{" "}
            <span className="font-medium text-slate-900">{selected?.name}</span>? Users
            assigned to this role will lose the permissions it granted.
          </>
        }
        confirmLabel="Delete"
        confirmingLabel="Deleting..."
        errorMessage="Could not delete this role. Please try again."
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
