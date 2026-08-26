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
import DepartmentFormDialog from "@/components/departments/DepartmentFormDialog";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import {
  createDepartment,
  deleteDepartment,
  listDepartments,
  updateDepartment,
  type DepartmentPayload,
} from "@/api/departments";
import type { Department } from "@/types";

export default function Departments() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<Department | null>(null);

  const fetchDepartments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setDepartments(await listDepartments());
    } catch {
      setError("Failed to load departments.");
      toast.error("Failed to load departments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  function openAddDialog() {
    setSelected(null);
    setFormOpen(true);
  }

  function openEditDialog(department: Department) {
    setSelected(department);
    setFormOpen(true);
  }

  function openDeleteDialog(department: Department) {
    setSelected(department);
    setDeleteOpen(true);
  }

  async function handleFormSubmit(payload: DepartmentPayload) {
    if (selected) {
      await updateDepartment(selected.id, payload);
    } else {
      await createDepartment(payload);
    }
    await fetchDepartments();
  }

  async function handleDeleteConfirm() {
    if (!selected) return;
    await deleteDepartment(selected.id);
    toast.success(`Department "${selected.name}" deleted.`);
    await fetchDepartments();
  }

  return (
    <div className="flex h-screen bg-app-grid">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="Departments" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Departments are used for Department Assignment on the Users screen.
            </p>
            <Button onClick={openAddDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add Department
            </Button>
          </div>

          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Users</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Spinner /> Loading departments...
                    </span>
                  </TableCell>
                </TableRow>
              ) : departments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    No departments found.
                  </TableCell>
                </TableRow>
              ) : (
                departments.map((department) => (
                  <TableRow key={department.id}>
                    <TableCell className="font-medium text-slate-900">
                      {department.name}
                    </TableCell>
                    <TableCell>{department.description || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="muted">{department._count?.users ?? 0}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Edit department"
                          onClick={() => openEditDialog(department)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Delete department"
                          onClick={() => openDeleteDialog(department)}
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

      <DepartmentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        department={selected}
        onSubmit={handleFormSubmit}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Department"
        description={
          <>
            Are you sure you want to delete{" "}
            <span className="font-medium text-slate-900">{selected?.name}</span>? Users
            assigned to this department will simply lose their department assignment.
          </>
        }
        confirmLabel="Delete"
        confirmingLabel="Deleting..."
        errorMessage="Could not delete this department. Please try again."
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
