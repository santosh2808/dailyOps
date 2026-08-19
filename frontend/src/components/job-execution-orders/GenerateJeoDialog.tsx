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
import { PRIORITY_OPTIONS } from "./jeoOptions";
import type { JeoPayload } from "@/api/job-execution-orders";
import type { JeoPriority, SalesOrder } from "@/types";

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
}

const emptyForm: FormState = {
  priority: "MEDIUM",
  assignedTo: "",
  remarks: "",
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

  useEffect(() => {
    if (open && salesOrder) {
      setForm(emptyForm);
      setError("");
    }
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
      });
      onOpenChange(false);
    } catch {
      setError("Could not generate the job execution order. Please try again.");
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
            {submitting ? "Generating..." : "Generate JEO"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
