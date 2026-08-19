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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { importSuppliers, previewSupplierImport } from "@/api/suppliers";
import type { SupplierImportRowResult, SupplierImportSummary } from "@/types";

interface ImportSupplierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => Promise<void> | void;
}

type Step = "upload" | "preview" | "summary";

function resultBadge(result: SupplierImportRowResult["result"]) {
  switch (result) {
    case "valid":
      return <Badge variant="info">Valid</Badge>;
    case "created":
      return <Badge variant="success">Created</Badge>;
    case "duplicate":
      return <Badge variant="warning">Duplicate</Badge>;
    case "invalid":
      return <Badge variant="destructive">Invalid</Badge>;
  }
}

// Preview-before-import flow for Supplier Import — same shape as
// ImportLeadsDialog: Upload -> Preview (server classifies every row as
// valid/invalid/duplicate, nothing inserted yet) -> commit only the 'valid'
// rows -> Summary.
export default function ImportSupplierDialog({ open, onOpenChange, onImported }: ImportSupplierDialogProps) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<SupplierImportSummary | null>(null);
  const [finalResult, setFinalResult] = useState<SupplierImportSummary | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
    setError("");
  }

  async function handlePreview() {
    if (!file) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await previewSupplierImport(file);
      setPreview(result);
      setStep("preview");
    } catch {
      setError("Could not read this file. Please check its format and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleImport() {
    if (!preview) return;
    const validRows = preview.rows.filter((r) => r.result === "valid");
    if (validRows.length === 0) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await importSuppliers(validRows);
      setFinalResult(result);
      setStep("summary");
      await onImported();
    } catch {
      setError("Something went wrong while importing. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setStep("upload");
    setFile(null);
    setPreview(null);
    setFinalResult(null);
    setError("");
    onOpenChange(false);
  }

  function renderRowsTable(rows: SupplierImportRowResult[]) {
    return (
      <div className="max-h-72 overflow-y-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Row</TableHead>
              <TableHead>Supplier Name</TableHead>
              <TableHead>GST Number</TableHead>
              <TableHead>Result</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.row}>
                <TableCell>{row.row}</TableCell>
                <TableCell>{row.supplierName || "—"}</TableCell>
                <TableCell>{row.gstNumber || "—"}</TableCell>
                <TableCell>{resultBadge(row.result)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {row.errors?.join("; ") || row.duplicateReason || row.supplierCode || "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent onClose={handleClose} className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import Suppliers</DialogTitle>
          <DialogDescription>
            {step === "upload" &&
              "Upload an .xlsx or .csv file using the Download Template column layout: Supplier Name, GST Number, PAN Number, Contact Person, Phone, Email, Website, Address, City, State, Country, PIN Code, Payment Terms, Lead Time, Currency, Remarks, Status. Only Supplier Name is required — every other column can be blank or left out of the file entirely."}
            {step === "preview" &&
              "Review the rows below. Only Valid rows will be imported — Invalid and Duplicate rows are skipped."}
            {step === "summary" && "Import complete."}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <Input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} />
        )}

        {step === "preview" && preview && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="muted">{preview.totalRows} rows</Badge>
              <Badge variant="info">{preview.validCount} valid</Badge>
              {preview.duplicateCount > 0 && (
                <Badge variant="warning">{preview.duplicateCount} duplicate</Badge>
              )}
              {preview.invalidCount > 0 && (
                <Badge variant="destructive">{preview.invalidCount} invalid</Badge>
              )}
            </div>
            {renderRowsTable(preview.rows)}
          </div>
        )}

        {step === "summary" && finalResult && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="muted">{finalResult.totalRows} rows</Badge>
              <Badge variant="success">{finalResult.createdCount} Imported</Badge>
              <Badge variant="warning">{finalResult.duplicateCount} Duplicates</Badge>
              <Badge variant="destructive">{finalResult.invalidCount} Failed</Badge>
            </div>
            {renderRowsTable(finalResult.rows)}
          </div>
        )}

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <DialogFooter>
          {step === "upload" && (
            <>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="button" onClick={handlePreview} disabled={!file || submitting}>
                {submitting ? "Reading file..." : "Preview"}
              </Button>
            </>
          )}
          {step === "preview" && (
            <>
              <Button type="button" variant="outline" onClick={() => setStep("upload")} disabled={submitting}>
                Back
              </Button>
              <Button
                type="button"
                onClick={handleImport}
                disabled={submitting || !preview || preview.validCount === 0}
              >
                {submitting
                  ? "Importing..."
                  : `Import ${preview?.validCount ?? 0} Valid Row${preview?.validCount === 1 ? "" : "s"}`}
              </Button>
            </>
          )}
          {step === "summary" && (
            <Button type="button" onClick={handleClose}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
