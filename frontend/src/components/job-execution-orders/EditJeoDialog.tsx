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
import { updateJobExecutionOrder, type UpdateJeoPayload } from "@/api/job-execution-orders";
import type { HangingStructureType, JeoPriority, JobExecutionOrder } from "@/types";

interface EditJeoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jeo: JobExecutionOrder | null;
  onSaved: (jeo: JobExecutionOrder) => void;
}

interface FormState {
  priority: JeoPriority;
  assignedTo: string;
  remarks: string;
  pipeLength: string;
  hangingStructureType: HangingStructureType | "";
  color: string;
}

// Bug-fix requirement: correct a JEO's details even after the factory
// notification has already gone out — this module previously had no edit
// endpoint at all. Field set mirrors GenerateJeoDialog exactly; pair with
// "Resend to Factory" (SendJeoDialog) afterward as the intended
// fix-a-mistake flow. salesOrderId and everything copied from it (customer,
// quotation, delivery date, products) stay fixed — not editable here.
export default function EditJeoDialog({ open, onOpenChange, jeo, onSaved }: EditJeoDialogProps) {
  const [form, setForm] = useState<FormState>({
    priority: "MEDIUM",
    assignedTo: "",
    remarks: "",
    pipeLength: "",
    hangingStructureType: "",
    color: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && jeo) {
      setForm({
        priority: jeo.priority,
        assignedTo: jeo.assignedTo ?? "",
        remarks: jeo.remarks ?? "",
        pipeLength: jeo.pipeLength ?? "",
        hangingStructureType: jeo.hangingStructureType ?? "",
        color: jeo.color ?? "",
      });
      setError("");
    }
  }, [open, jeo]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleConfirm() {
    if (!jeo) return;
    setSubmitting(true);
    setError("");
    try {
      const payload: UpdateJeoPayload = {
        priority: form.priority,
        assignedTo: form.assignedTo.trim() || undefined,
        remarks: form.remarks.trim() || undefined,
        pipeLength: form.pipeLength.trim() || undefined,
        hangingStructureType: form.hangingStructureType || undefined,
        color: form.color.trim() || undefined,
      };
      const updated = await updateJobExecutionOrder(jeo.id, payload);
      toast.success("Job Execution Order updated.");
      onSaved(updated);
      onOpenChange(false);
    } catch (err: any) {
      const message =
        err?.response?.data?.message || "Could not update the job execution order. Please try again.";
      setError(Array.isArray(message) ? message.join(" ") : message);
      toast.error(Array.isArray(message) ? message.join(" ") : message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!jeo) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Edit Job Execution Order</DialogTitle>
          <DialogDescription>
            Correct <span className="font-medium text-slate-900">{jeo.jeoNumber}</span>'s details
            below. If the factory notification already went out, use "Resend to Factory" afterward
            so production gets the corrected PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="edit-jeo-priority">Priority</Label>
            <Select
              id="edit-jeo-priority"
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
            <Label htmlFor="edit-jeo-assignedTo">Assigned To</Label>
            <Input
              id="edit-jeo-assignedTo"
              value={form.assignedTo}
              onChange={(e) => update("assignedTo", e.target.value)}
              placeholder="e.g. Rahul (Production)"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-jeo-pipeLength">Pipe Length</Label>
            <Input
              id="edit-jeo-pipeLength"
              value={form.pipeLength}
              onChange={(e) => update("pipeLength", e.target.value)}
              placeholder="e.g. 12 ft"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-jeo-hangingStructureType">Hanging Structure</Label>
            <Select
              id="edit-jeo-hangingStructureType"
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
            <Label htmlFor="edit-jeo-color">Fan Colour</Label>
            <Input
              id="edit-jeo-color"
              value={form.color}
              onChange={(e) => update("color", e.target.value)}
              placeholder="Aluminium"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="edit-jeo-remarks">Remarks</Label>
            <Textarea
              id="edit-jeo-remarks"
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
            {submitting ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
