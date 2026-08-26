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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { updateEmailTemplate } from "@/api/email-templates";
import type { EmailTemplate } from "@/types";

interface EditEmailTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: EmailTemplate | null;
  onSaved: () => void;
}

export default function EditEmailTemplateDialog({
  open,
  onOpenChange,
  template,
  onSaved,
}: EditEmailTemplateDialogProps) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && template) {
      setName(template.name);
      setSubject(template.subject);
      setBodyHtml(template.bodyHtml);
      setIsActive(template.isActive);
      setError("");
    }
  }, [open, template]);

  async function handleSave() {
    if (!template) return;
    setSubmitting(true);
    setError("");
    try {
      await updateEmailTemplate(template.id, { name, subject, bodyHtml, isActive });
      toast.success("Email template saved.");
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      const message =
        err?.response?.data?.message || "Could not save this email template. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Email Template</DialogTitle>
          <DialogDescription>
            Key: <span className="font-mono text-xs">{template.key}</span> (fixed — templates are
            matched by key when an automated email is sent).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="template-name">Display Name</Label>
            <Input id="template-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="template-subject">Subject</Label>
            <Input
              id="template-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Quotation {{quotationNumber}} from DailyOps"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="template-body">Body (HTML)</Label>
            <Textarea
              id="template-body"
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              className="min-h-[220px] font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Use {"{{tokenName}}"} placeholders — they're substituted with real values when the
              email is sent (see MailerService).
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active
          </label>
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
          <Button type="button" onClick={handleSave} disabled={submitting}>
            {submitting && <Spinner className="mr-2 h-4 w-4" />}
            {submitting ? "Saving..." : "Save Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
