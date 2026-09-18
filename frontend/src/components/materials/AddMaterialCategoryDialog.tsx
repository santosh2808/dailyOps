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
import { getErrorMessage } from "@/lib/errors";
import { createMaterialCategory } from "@/api/material-categories";
import type { MaterialCategory } from "@/types";

// Material Form "+ Add new category" (TC-073) — lets whoever is creating or
// editing a Material add a Category on the fly, instead of leaving the form
// to use a separate screen and coming back. Deliberately its own <form>
// inside the Dialog (same nested-dialog-inside-a-page-form pattern as
// QuickAddUserDialog inside LeadForm) so pressing Enter while typing the
// name submits *this* dialog's form, not the outer Material form.
interface AddMaterialCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (category: MaterialCategory) => void;
}

export default function AddMaterialCategoryDialog({
  open,
  onOpenChange,
  onCreated,
}: AddMaterialCategoryDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setDescription("");
    setError("");
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Category name is required");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const created = await createMaterialCategory({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      toast.success("Category added.");
      onCreated(created);
    } catch (err) {
      const message = getErrorMessage(err, "Could not add this category. Please try again.");
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
          <DialogTitle>Add Category</DialogTitle>
          <DialogDescription>
            Create a new material category without leaving this form.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="newMaterialCategoryName">Category Name *</Label>
            <Input
              id="newMaterialCategoryName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="newMaterialCategoryDescription">Description</Label>
            <Input
              id="newMaterialCategoryDescription"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
              {submitting ? "Adding..." : "Add Category"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
