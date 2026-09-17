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
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { createMaterialUnit } from "@/api/material-units";
import type { MaterialUnit } from "@/types";

// Material Form "+ Add new unit" (TC-073) — same reasoning as
// AddMaterialCategoryDialog: its own nested <form> inside the Dialog so
// pressing Enter while typing the name submits this dialog, not the outer
// Material form.
interface AddMaterialUnitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (unit: MaterialUnit) => void;
}

export default function AddMaterialUnitDialog({
  open,
  onOpenChange,
  onCreated,
}: AddMaterialUnitDialogProps) {
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setSymbol("");
    setError("");
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Unit name is required");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const created = await createMaterialUnit({
        name: name.trim(),
        symbol: symbol.trim() || undefined,
      });
      toast.success("Unit added.");
      onCreated(created);
    } catch {
      const message = "Could not add this unit. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)} size="sm">
        <DialogHeader>
          <DialogTitle>Add Unit</DialogTitle>
          <DialogDescription>
            Create a new material unit without leaving this form.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="newMaterialUnitName">Unit Name *</Label>
            <Input
              id="newMaterialUnitName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="newMaterialUnitSymbol">Symbol</Label>
            <Input
              id="newMaterialUnitSymbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="e.g. Kg"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Spinner className="mr-2 h-4 w-4" />}
              {submitting ? "Adding..." : "Add Unit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
