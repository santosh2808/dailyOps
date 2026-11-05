import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
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
import { Checkbox } from "@/components/ui/checkbox";
import { MobileRecordList, ResponsiveRecords } from "@/components/shared/MobileRecordList";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/errors";
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

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const fetchCodes = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCodes(await listStateSeriesCodes());
    } catch (err) {
      const message = getErrorMessage(err, "Failed to load state series codes.");
      setError(message);
      toast.error(message);
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

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.size === codes.length ? new Set() : new Set(codes.map((c) => c.id))));
  }

  async function handleBulkDeleteConfirm() {
    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(ids.map((id) => deleteStateSeriesCode(id)));
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - succeeded;
    if (succeeded > 0) {
      toast.success(`${succeeded} series deleted.`);
    }
    if (failed > 0) {
      toast.error(`${failed} series could not be deleted.`);
    }
    setSelectedIds(new Set());
    await fetchCodes();
  }

  // Row actions, shared by the table's Actions cell and the mobile card.
  function seriesActions(code: StateSeriesCode) {
    return (
      <>
        <Button
          variant="ghost"
          size="icon"
          title="Delete series"
          onClick={() => openDeleteDialog(code)}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </>
    );
  }

  return (
    <div className="app-shell bg-app-grid">
      <Sidebar />
      <div className="app-shell-content">
        <Topbar title="State Series Codes" />
        <main className="app-shell-main app-shell-main-list">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              A Job Execution Order's number is its state's Series Start plus its Sales Order's
              number (e.g. Telangana 4000 + SO-2026-000004 → JEO 4004). A state not listed here is
              added automatically, with the next free series, the first time it needs a JEO.
            </p>
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add State Series
            </Button>
          </div>

          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

          {selectedIds.size > 0 && (
            <div className="mb-3 flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-4 py-2">
              <p className="text-sm text-slate-700">
                {selectedIds.size} series selected
              </p>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                  Clear
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Selected
                </Button>
              </div>
            </div>
          )}

          <ResponsiveRecords
            table={
              <Table fillHeightOnMobile>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        ref={(el) => {
                          if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < codes.length;
                        }}
                        checked={codes.length > 0 && selectedIds.size === codes.length}
                        onChange={toggleSelectAll}
                        aria-label="Select all state series"
                      />
                    </TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Series Start</TableHead>
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
                        No state series configured yet. Each state gets one automatically with its
                        first JEO.
                      </TableCell>
                    </TableRow>
                  ) : (
                    codes.map((code) => (
                      <TableRow key={code.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(code.id)}
                            onChange={() => toggleSelected(code.id)}
                            aria-label={`Select series for ${code.state}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium text-slate-900">{code.state}</TableCell>
                        <TableCell>{code.seriesStart}</TableCell>
                        <TableCell>{new Date(code.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">{seriesActions(code)}</div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            }
            mobile={
              <MobileRecordList
                rows={codes}
                getKey={(code) => code.id}
                title={(code) => code.state}
                subtitle={(code) => `Series Start ${code.seriesStart}`}
                meta={(code) => `Added ${new Date(code.createdAt).toLocaleDateString()}`}
                fields={[
                  { label: "Series Start", render: (code) => code.seriesStart },
                  { label: "Added", render: (code) => new Date(code.createdAt).toLocaleDateString() },
                ]}
                actions={seriesActions}
                loading={loading}
                loadingText="Loading state series codes..."
                emptyText="No state series configured yet. Each state gets one automatically with its first JEO."
                selection={{
                  selected: selectedIds,
                  onToggle: toggleSelected,
                  onToggleAll: toggleSelectAll,
                  rowLabel: (code) => `Select series for ${code.state}`,
                }}
              />
            }
          />
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
            generated keep their numbers; the state's next JEO will be given a new series
            automatically unless you add one first.
          </>
        }
        confirmLabel="Delete"
        confirmingLabel="Deleting..."
        errorMessage="Could not delete this series. Please try again."
        onConfirm={handleDeleteConfirm}
      />
      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={`Delete ${selectedIds.size} series?`}
        description="JEOs already generated keep their numbers; each state's next JEO will be given a new series automatically unless you add one first."
        confirmLabel="Delete"
        confirmingLabel="Deleting..."
        onConfirm={handleBulkDeleteConfirm}
      />
    </div>
  );
}
