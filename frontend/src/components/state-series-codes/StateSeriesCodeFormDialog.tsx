import { useEffect, useState, type FormEvent } from "react";
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
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { INDIA_STATES } from "@/lib/indiaStates";
import type { StateSeriesCodePayload } from "@/api/state-series-codes";

interface StateSeriesCodeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // States that already have a series configured — excluded from the
  // dropdown so you can't accidentally try to add a second series for the
  // same state (the backend also rejects this, but filtering here avoids
  // the round-trip error).
  configuredStates: string[];
  onSubmit: (payload: StateSeriesCodePayload) => Promise<void>;
}

interface FormState {
  state: string;
  seriesStart: string;
}

const emptyForm: FormState = { state: "", seriesStart: "" };

// Adds a new state -> numbering-series mapping (e.g. "Gujarat starting at
// 10000") so future states beyond the six already configured can be added
// without a code change — per the Administrator's own request that this be
// extensible.
export default function StateSeriesCodeFormDialog({
  open,
  onOpenChange,
  configuredStates,
  onSubmit,
}: StateSeriesCodeFormDialogProps) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(emptyForm);
      setError("");
      setSubmitError("");
    }
  }, [open]);

  const availableStates = INDIA_STATES.filter((s) => !configuredStates.includes(s));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError("");

    if (!form.state) {
      setError("Select a state.");
      return;
    }
    const seriesStart = Number(form.seriesStart);
    if (!form.seriesStart.trim() || !Number.isInteger(seriesStart) || seriesStart < 1) {
      setError("Series Start must be a whole number, 1 or greater.");
      return;
    }
    setError("");

    setSubmitting(true);
    try {
      await onSubmit({ state: form.state, seriesStart });
      toast.success(`Series for ${form.state} added.`);
      onOpenChange(false);
    } catch (err: any) {
      const message =
        err?.response?.data?.message || "Could not add this series. Please try again.";
      setSubmitError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Add State Series</DialogTitle>
          <DialogDescription>
            New JEOs generated for customers in this state will be numbered starting from the
            value below (e.g. 4000, 4001, 4002...). Existing JEOs are never renumbered.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="seriesState">State *</Label>
            <Select
              id="seriesState"
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
            >
              <option value="">Select state...</option>
              {availableStates.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
            {availableStates.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Every state already has a series configured.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="seriesStart">Series Start *</Label>
            <Input
              id="seriesStart"
              inputMode="numeric"
              placeholder="e.g. 4000"
              value={form.seriesStart}
              onChange={(e) => setForm({ ...form, seriesStart: e.target.value.replace(/\D/g, "") })}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          {submitError && <p className="text-sm text-destructive">{submitError}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || availableStates.length === 0}>
              {submitting && <Spinner className="mr-2 h-4 w-4" />}
              {submitting ? "Adding..." : "Add Series"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
