import { useState, type ChangeEvent } from "react";
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
import { Badge } from "@/components/ui/badge";
import { importMaterials } from "@/api/materials";
import type { MaterialImportResult } from "@/types";

interface ImportMaterialsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => Promise<void> | void;
}

export default function ImportMaterialsDialog({
  open,
  onOpenChange,
  onImported,
}: ImportMaterialsDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<MaterialImportResult | null>(null);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
    setResult(null);
    setError("");
  }

  async function handleImport() {
    if (!file) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await importMaterials(file);
      setResult(res);
      await onImported();
    } catch {
      setError("Could not import this file. Please check its format and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setFile(null);
    setResult(null);
    setError("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent onClose={handleClose} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Materials from Excel</DialogTitle>
          <DialogDescription>
            Upload an .xlsx file with columns: materialCode, name, description, category,
            unit, supplierId, cost, minimumStock, maximumStock, reorderLevel, currentStock,
            warehouseId, isActive. Category and unit are matched by name and must already
            exist. Existing materials are matched and updated by materialCode.
          </DialogDescription>
        </DialogHeader>

        <Input type="file" accept=".xlsx,.xls" onChange={handleFileChange} />

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        {result && (
          <div className="mt-4 max-h-64 space-y-2 overflow-y-auto rounded-md border p-3 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant="muted">{result.totalRows} rows</Badge>
              <Badge variant="success">{result.created} created</Badge>
              <Badge variant="info">{result.updated} updated</Badge>
              {result.failed > 0 && <Badge variant="destructive">{result.failed} failed</Badge>}
            </div>
            {result.failed > 0 && (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {result.results
                  .filter((r) => r.status === "failed")
                  .map((r) => (
                    <li key={r.row}>
                      Row {r.row} ({r.materialCode}): {r.error}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Close
          </Button>
          <Button type="button" onClick={handleImport} disabled={!file || submitting}>
            {submitting ? "Importing..." : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
