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
import { getErrorMessage } from "@/lib/errors";
import { HANGING_STRUCTURE_OPTIONS, PRIORITY_OPTIONS } from "./jeoOptions";
import type { JeoPayload } from "@/api/job-execution-orders";
import { getQuotation } from "@/api/quotations";
import type { HangingStructureType, JeoPriority, SalesOrder } from "@/types";

// Production-start gate: generating a JEO now requires at least
// MINIMUM_ADVANCE_PERCENT (50%) advance received against the Sales Order's
// active Proforma Invoice — same threshold as the existing dispatch gate
// (ChangeSalesOrderStatusDialog.tsx) and Record Advance Payment minimum
// (RecordAdvancePaymentDialog.tsx). Override Approval workflow: below that
// threshold there is no self-declare escape hatch anymore — the backend
// raises a real OverrideApprovalRequest and emails Santosh Kumar Chegondi /
// Amarpal Gampa a one-click approve/reject link; the JEO is generated
// automatically once one of them approves it.
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
  advanceReceived,
  onConfirm,
}: GenerateJeoDialogProps) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  // True when the backend's 409 response means "an approval request has
  // been emailed" rather than an ordinary failure — styled as an
  // informational notice instead of a red error.
  const [approvalRequested, setApprovalRequested] = useState(false);

  useEffect(() => {
    if (!open || !salesOrder) return;
    setForm(emptyForm);
    setError("");
    setApprovalRequested(false);
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

  async function handleConfirm() {
    setSubmitting(true);
    setError("");
    setApprovalRequested(false);
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
    } catch (err) {
      // Surface the backend's actual reason (e.g. "An active Job Execution
      // Order already exists for this Sales Order.") instead of a generic
      // message — this dialog previously discarded it entirely, which made
      // real causes (conflicts, permission errors, validation) impossible
      // to diagnose from the UI. A 409 here specifically means the
      // production-start gate blocked generation and raised (or reused) a
      // real approval request — not a plain failure, so it gets its own
      // amber notice instead of toast.error's red styling.
      const finalMessage = getErrorMessage(err, "Could not generate the job execution order. Please try again.");
      const isApprovalConflict = isAxiosError(err) && err.response?.status === 409;
      setError(finalMessage);
      setApprovalRequested(isApprovalConflict);
      if (isApprovalConflict) {
        toast.info(finalMessage, "Approval requested");
      } else {
        toast.error(finalMessage);
      }
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

        {belowThreshold && !approvalRequested && (
          <div className="mt-3 space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-900">
              Advance received ({formatRupees(advanceReceived)}) is below the required{" "}
              {MINIMUM_ADVANCE_PERCENT}% of the order total ({formatRupees(requiredAdvance)}).
            </p>
            <p className="text-xs text-muted-foreground">
              Continuing will email Santosh Kumar Chegondi and Amarpal Gampa an approval link — the
              JEO is generated automatically once one of them approves it.
            </p>
          </div>
        )}

        {approvalRequested ? (
          <p className="mt-2 text-sm text-amber-900">{error}</p>
        ) : (
          error && <p className="mt-2 text-sm text-destructive">{error}</p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {approvalRequested ? "Close" : "Cancel"}
          </Button>
          {!approvalRequested && (
            <Button type="button" onClick={handleConfirm} disabled={submitting}>
              {submitting && <Spinner className="mr-2 h-4 w-4" />}
              {submitting ? "Generating..." : "Generate JEO"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
