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
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { importLeads, previewLeadImport } from "@/api/leads";
import type { LeadImportRowResult, LeadImportSummary } from "@/types";

interface ImportLeadsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => Promise<void> | void;
}

type Step = "upload" | "preview" | "summary";

function resultBadge(result: LeadImportRowResult["result"]) {
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

export default function ImportLeadsDialog({ open, onOpenChange, onImported }: ImportLeadsDialogProps) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<LeadImportSummary | null>(null);
  const [finalResult, setFinalResult] = useState<LeadImportSummary | null>(null);
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
      const result = await previewLeadImport(file);
      setPreview(result);
      setStep("preview");
    } catch {
      const message = "Could not read this file. Please check its format and try again.";
      setError(message);
      toast.error(message);
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
      const result = await importLeads(validRows);
      setFinalResult(result);
      setStep("summary");
      toast.success(`Imported ${result.createdCount} of ${result.totalRows} leads.`);
      await onImported();
    } catch {
      const message = "Something went wrong while importing. Please try again.";
      setError(message);
      toast.error(message);
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

  function renderRowsTable(rows: LeadImportRowResult[]) {
    return (
      <div className="max-h-72 overflow-y-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Row</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Result</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.row}>
                <TableCell>{row.row}</TableCell>
                <TableCell>{row.companyName || "—"}</TableCell>
                <TableCell>{row.email || "—"}</TableCell>
                <TableCell>{resultBadge(row.result)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {row.errors?.join("; ") || row.duplicateReason || row.leadNumber || "—"}
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
          <DialogTitle>Import Leads</DialogTitle>
          <DialogDescription>
            {step === "upload" &&
              "Upload an .xlsx or .csv file using the Download Template column layout: Company Name, Contact Person, Email, Phone, City, State, Industry, Lead Source, Status, Remarks. No column is required — any of them can be blank or left out of the file entirely."}
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
                {submitting && <Spinner className="mr-2 h-4 w-4" />}
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
                {submitting && <Spinner className="mr-2 h-4 w-4" />}
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
