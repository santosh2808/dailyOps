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
import { isAxiosError } from "axios";
import { HANGING_STRUCTURE_OPTIONS, PRIORITY_OPTIONS } from "./jeoOptions";
import type { JeoPayload } from "@/api/job-execution-orders";
import { getQuotation } from "@/api/quotations";
import { DISPATCH_OVERRIDE_APPROVERS, type HangingStructureType, type JeoPriority, type SalesOrder } from "@/types";

// Production-start gate: generating a JEO now requires at least
// MINIMUM_ADVANCE_PERCENT (50%) advance received against the Sales Order's
// active Proforma Invoice — same threshold and named-approver override as
// the existing dispatch gate (ChangeSalesOrderStatusDialog.tsx) and Record
// Advance Payment minimum (RecordAdvancePaymentDialog.tsx).
const MINIMUM_ADVANCE_PERCENT = 50;

function formatRupees(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

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
  // Current advance received on the active Proforma Invoice (0 if none) —
  // passed in from SalesOrderDetails.tsx, same value already used for
  // ChangeSalesOrderStatusDialog's dispatch gate, so the production-start
  // threshold can be checked proactively instead of only reacting to a
  // backend rejection.
  advanceReceived: number;
  // Whether the acting user holds the Administrator role — only an Admin
  // may record a production-start override (see
  // JobExecutionOrdersService.create()). This only drives which UI is
  // shown; the backend enforces it for real.
  isAdmin: boolean;
  onConfirm: (payload: Omit<JeoPayload, "salesOrderId">) => Promise<void>;
}

interface FormState {
  priority: JeoPriority;
  assignedTo: string;
  remarks: string;
  pipeLength: string;
  hangingStructureType: HangingStructureType | "";
  color: string;
  productionOverrideApprovedBy: string;
  productionOverrideNote: string;
}

const emptyForm: FormState = {
  priority: "MEDIUM",
  assignedTo: "",
  remarks: "",
  pipeLength: "",
  hangingStructureType: "",
  color: "Aluminium",
  productionOverrideApprovedBy: "",
  productionOverrideNote: "",
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
  advanceReceived,
  isAdmin,
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

  const grandTotal = salesOrder?.grandTotal ?? 0;
  const requiredAdvance = grandTotal > 0 ? (grandTotal * MINIMUM_ADVANCE_PERCENT) / 100 : 0;
  const belowThreshold = advanceReceived < requiredAdvance;
  const canSubmit = !belowThreshold || (isAdmin && !!form.productionOverrideApprovedBy);

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
        productionOverrideApprovedBy: belowThreshold ? form.productionOverrideApprovedBy || undefined : undefined,
        productionOverrideNote: belowThreshold ? form.productionOverrideNote.trim() || undefined : undefined,
      });
      onOpenChange(false);
    } catch (err) {
      // Surface the backend's actual reason (e.g. "An active Job Execution
      // Order already exists for this Sales Order.") instead of a generic
      // message — this dialog previously discarded it entirely, which made
      // real causes (conflicts, permission errors, validation) impossible
      // to diagnose from the UI.
      const backendMessage = isAxiosError(err) ? err.response?.data?.message : undefined;
      const message = Array.isArray(backendMessage) ? backendMessage.join(" ") : backendMessage;
      const finalMessage = message || "Could not generate the job execution order. Please try again.";
      setError(finalMessage);
      toast.error(finalMessage);
    } finally {
      setSubmitting(false);
    }
  }

  if (!salesOrder) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)} size="lg">
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

        {belowThreshold && !isAdmin && (
          <div className="mt-3 space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-sm font-medium text-destructive">
              Advance received ({formatRupees(advanceReceived)}) is below the required{" "}
              {MINIMUM_ADVANCE_PERCENT}% of the order total ({formatRupees(requiredAdvance)}).
            </p>
            <p className="text-xs text-muted-foreground">
              Only an Administrator can start production below the threshold, and only with
              authorization from Santosh Kumar Chegondi or Amarpal Gampa.
            </p>
          </div>
        )}

        {belowThreshold && isAdmin && (
          <div className="mt-3 space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-900">
              Advance received ({formatRupees(advanceReceived)}) is below the required{" "}
              {MINIMUM_ADVANCE_PERCENT}% of the order total ({formatRupees(requiredAdvance)}).
            </p>
            <div className="space-y-2">
              <Label htmlFor="production-override-approved-by">Approved By (required)</Label>
              <Select
                id="production-override-approved-by"
                value={form.productionOverrideApprovedBy}
                onChange={(e) => update("productionOverrideApprovedBy", e.target.value)}
              >
                <option value="">Select...</option>
                {DISPATCH_OVERRIDE_APPROVERS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="production-override-note">Note (optional)</Label>
              <Textarea
                id="production-override-note"
                placeholder="e.g. Customer confirmed payment on delivery — production approved per Sales Manager."
                value={form.productionOverrideNote}
                onChange={(e) => update("productionOverrideNote", e.target.value)}
              />
            </div>
          </div>
        )}

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
          <Button type="button" onClick={handleConfirm} disabled={submitting || !canSubmit}>
            {submitting && <Spinner className="mr-2 h-4 w-4" />}
            {submitting ? "Generating..." : "Generate JEO"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
