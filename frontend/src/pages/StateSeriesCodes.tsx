import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import StateSeriesCodeFormDialog from "@/components/state-series-codes/StateSeriesCodeFormDialog";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import {
  createStateSeriesCode,
  deleteStateSeriesCode,
  listStateSeriesCodes,
  type StateSeriesCodePayload,
} from "@/api/state-series-codes";
import type { StateSeriesCode } from "@/types";

export default function StateSeriesCodes() {
  const [codes, setCodes] = useState<StateSeriesCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<StateSeriesCode | null>(null);

  const fetchCodes = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCodes(await listStateSeriesCodes());
    } catch {
      setError("Failed to load state series codes.");
      toast.error("Failed to load state series codes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCodes();
  }, [fetchCodes]);

  function openDeleteDialog(code: StateSeriesCode) {
    setSelected(code);
    setDeleteOpen(true);
  }

  async function handleFormSubmit(payload: StateSeriesCodePayload) {
    await createStateSeriesCode(payload);
    await fetchCodes();
  }

  async function handleDeleteConfirm() {
    if (!selected) return;
    await deleteStateSeriesCode(selected.id);
    toast.success(`Series for ${selected.state} deleted.`);
    await fetchCodes();
  }

  return (
    <div className="flex h-screen bg-app-grid">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="State Series Codes" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Job Execution Orders for customers in a listed state are numbered from that state's
              Series Start (e.g. Telangana JEOs run 4000, 4001, 4002...). States not listed here
              still get JEO numbers using the original JEO-YYYY-NNNNNN format.
            </p>
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add State Series
            </Button>
          </div>

          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>State</TableHead>
                <TableHead>Series Start</TableHead>
                <TableHead>Next JEO Number</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Spinner /> Loading state series codes...
                    </span>
                  </TableCell>
                </TableRow>
              ) : codes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No state series configured yet. Every state currently uses the original
                    JEO-YYYY-NNNNNN numbering.
                  </TableCell>
                </TableRow>
              ) : (
                codes.map((code) => (
                  <TableRow key={code.id}>
                    <TableCell className="font-medium text-slate-900">{code.state}</TableCell>
                    <TableCell>{code.seriesStart}</TableCell>
                    <TableCell>
                      <Badge variant="muted">{code.nextNumber}</Badge>
                    </TableCell>
                    <TableCell>{new Date(code.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Delete series"
                          onClick={() => openDeleteDialog(code)}
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

      <StateSeriesCodeFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        configuredStates={codes.map((c) => c.state)}
        onSubmit={handleFormSubmit}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete State Series"
        description={
          <>
            Are you sure you want to delete the series for{" "}
            <span className="font-medium text-slate-900">{selected?.state}</span>? JEOs already
            generated keep their numbers; future JEOs for this state will fall back to the
            original JEO-YYYY-NNNNNN numbering until a new series is added.
          </>
        }
        confirmLabel="Delete"
        confirmingLabel="Deleting..."
        errorMessage="Could not delete this series. Please try again."
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
