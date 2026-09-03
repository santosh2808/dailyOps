import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { convertLeadToComplaint } from "@/api/leads";
import type { Lead } from "@/types";

interface ConvertToComplaintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
}

export default function ConvertToComplaintDialog({ open, onOpenChange, lead }: ConvertToComplaintDialogProps) {
  const navigate = useNavigate();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setReason("");
      setError("");
    }
  }, [open]);

  async function handleConfirm() {
    if (!lead) return;
    setSubmitting(true);
    setError("");
    try {
      const complaint = await convertLeadToComplaint(lead.id, reason.trim() || undefined);
      toast.success(`Converted to Complaint ${complaint.complaintNumber}.`);
      onOpenChange(false);
      navigate(`/complaints/${complaint.id}`);
    } catch {
      setError("Could not convert this lead. Please try again.");
      toast.error("Could not convert this lead to a complaint.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!lead) return null;

  const preview: { field: string; value: string }[] = [
    { field: "Reporter Name", value: lead.contactPerson || "—" },
    { field: "Email", value: lead.email || "—" },
    { field: "Phone", value: lead.phone || "—" },
    { field: "Subject", value: lead.title || "—" },
    { field: "Description", value: lead.description || "—" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Convert to Complaint</DialogTitle>
          <DialogDescription>
            This will create a new Complaint from {lead.leadNumber}'s own details and mark this lead as converted.
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <Table>
          <TableBody>
            {preview.map((row) => (
              <TableRow key={row.field}>
                <TableCell className="w-40 font-medium text-slate-700">{row.field}</TableCell>
                <TableCell>{row.value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="space-y-2">
          <Label htmlFor="convert-to-complaint-reason">Reason (optional)</Label>
          <Textarea
            id="convert-to-complaint-reason"
            placeholder="This is actually a warranty issue, not a sales opportunity"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={submitting}>
            {submitting && <Spinner className="mr-2 h-4 w-4" />}
            {submitting ? "Converting..." : "Convert to Complaint"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
