import { useEffect, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { HANGING_STRUCTURE_OPTIONS, PRIORITY_OPTIONS } from "./jeoOptions";
import type { JeoPayload } from "@/api/job-execution-orders";
import { getQuotation } from "@/api/quotations";
import type { HangingStructureType, JeoPriority, SalesOrder } from "@/types";

// Additive: pre-fill Scope of Work (pipe length / hanging structure / color)
// from the source quotation's own per-item choices, so staff generating a
// JEO from a quotation that already specified these don't have to re-enter
// them — still fully editable here, per the same "collected once at JEO
// generation" convention this dialog already follows. Returns a value only
// when every item on the quotation agrees on it (or when there's exactly
// one item); a quotation with genuinely mixed fans on one JEO is left blank
// for staff to decide rather than guessing.
function suggestScopeOfWork(quotation: Awaited<ReturnType<typeof getQuotation>>): {
  pipeLength: string;
  hangingStructureType: HangingStructureType | "";
  color: string;
} {
  const items = quotation.items ?? [];
  const distinct = <T,>(values: (T | null | undefined)[]): T | undefined => {
    const nonEmpty = [...new Set(values.filter((v): v is T => v !== null && v !== undefined && v !== ""))];
    return nonEmpty.length === 1 ? nonEmpty[0] : undefined;
  };
  return {
    pipeLength: distinct(items.map((i) => i.pipeLength?.trim())) ?? "",
    hangingStructureType: distinct(items.map((i) => i.hangingStructureType)) ?? "",
    color: distinct(items.map((i) => i.color?.trim())) ?? "Aluminium",
  };
}

interface GenerateJeoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salesOrder: SalesOrder | null;
  onConfirm: (payload: Omit<JeoPayload, "salesOrderId">) => Promise<void>;
}

interface FormState {
  priority: JeoPriority;
  assignedTo: string;
  remarks: string;
  pipeLength: string;
  hangingStructureType: HangingStructureType | "";
  color: string;
}

const emptyForm: FormState = {
  priority: "MEDIUM",
  assignedTo: "",
  remarks: "",
  pipeLength: "",
  hangingStructureType: "",
  color: "Aluminium",
};

// Generates a JEO from an existing Sales Order. Customer, Quotation
// reference, Sales Order reference, products, and delivery date are always
// copied server-side — this dialog only collects the JEO-specific details a
// Sales Order doesn't already have (priority, who it's assigned to,
// remarks). There is no separate "Create" page: this dialog IS the create
// flow, per the "Generate JEO" button in scope.
export default function GenerateJeoDialog({
  open,
  onOpenChange,
  salesOrder,
  onConfirm,
}: GenerateJeoDialogProps) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);

  useEffect(() => {
    if (!open || !salesOrder) return;
    setForm(emptyForm);
    setError("");
    // Pre-fill Scope of Work from the source quotation — best-effort only;
    // if this fails (or the quotation has no items to suggest from), the
    // dialog just falls back to emptyForm's defaults, same as before this
    // feature existed.
    let cancelled = false;
    setLoadingSuggestion(true);
    getQuotation(salesOrder.quotationId)
      .then((quotation) => {
        if (cancelled) return;
        const suggestion = suggestScopeOfWork(quotation);
        setForm((f) => ({ ...f, ...suggestion }));
      })
      .catch(() => {
        // Ignore — staff can still fill Scope of Work in by hand.
      })
      .finally(() => {
        if (!cancelled) setLoadingSuggestion(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, salesOrder]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleConfirm() {
    setSubmitting(true);
    setError("");
    try {
      await onConfirm({
        priority: form.priority,
        assignedTo: form.assignedTo.trim() || undefined,
        remarks: form.remarks.trim() || undefined,
        pipeLength: form.pipeLength.trim() || undefined,
        hangingStructureType: form.hangingStructureType || undefined,
        color: form.color.trim() || undefined,
      });
      onOpenChange(false);
    } catch {
      setError("Could not generate the job execution order. Please try again.");
      toast.error("Could not generate the job execution order.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!salesOrder) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Generate Job Execution Order</DialogTitle>
          <DialogDescription>
            Customer, quotation reference, products, and delivery date will be copied automatically
            from <span className="font-medium text-slate-900">{salesOrder.salesOrderNumber}</span>.
            Fill in any JEO-specific details below.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="priority">Priority</Label>
            <Select
              id="priority"
              value={form.priority}
              onChange={(e) => update("priority", e.target.value as JeoPriority)}
            >
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="assignedTo">Assigned To</Label>
            <Input
              id="assignedTo"
              value={form.assignedTo}
              onChange={(e) => update("assignedTo", e.target.value)}
              placeholder="e.g. Rahul (Production)"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <p className="text-xs text-slate-500">
              {loadingSuggestion
                ? "Checking the quotation for a color / hanging structure already specified..."
                : "Pipe length, hanging structure, and colour below are pre-filled from the quotation when it specified them — still editable."}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pipeLength">Pipe Length</Label>
            <Input
              id="pipeLength"
              value={form.pipeLength}
              onChange={(e) => update("pipeLength", e.target.value)}
              placeholder="e.g. 12 ft"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hangingStructureType">Hanging Structure</Label>
            <Select
              id="hangingStructureType"
              value={form.hangingStructureType}
              onChange={(e) =>
                update("hangingStructureType", e.target.value as HangingStructureType | "")
              }
            >
              <option value="">Select...</option>
              {HANGING_STRUCTURE_OPTIONS.map((h) => (
                <option key={h.value} value={h.value}>
                  {h.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="color">Fan Colour</Label>
            <Input
              id="color"
              value={form.color}
              onChange={(e) => update("color", e.target.value)}
              placeholder="Aluminium"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="remarks">Remarks</Label>
            <Textarea
              id="remarks"
              value={form.remarks}
              onChange={(e) => update("remarks", e.target.value)}
            />
          </div>
        </div>

        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={submitting}>
            {submitting && <Spinner className="mr-2 h-4 w-4" />}
            {submitting ? "Generating..." : "Generate JEO"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
