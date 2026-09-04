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
import { convertComplaintToLead } from "@/api/complaints";
import type { Complaint } from "@/types";

interface ConvertToLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  complaint: Complaint | null;
}

export default function ConvertToLeadDialog({ open, onOpenChange, complaint }: ConvertToLeadDialogProps) {
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
    if (!complaint) return;
    setSubmitting(true);
    setError("");
    try {
      const lead = await convertComplaintToLead(complaint.id, reason.trim() || undefined);
      toast.success(`Converted to Lead ${lead.leadNumber}.`);
      onOpenChange(false);
      navigate(`/leads/${lead.id}`);
    } catch {
      setError("Could not convert this complaint. Please try again.");
      toast.error("Could not convert this complaint to a lead.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!complaint) return null;

  const preview: { field: string; value: string }[] = [
    { field: "Contact Person", value: complaint.reporterName || "—" },
    { field: "Email", value: complaint.reporterEmail || "—" },
    { field: "Phone", value: complaint.reporterPhone || "—" },
    { field: "Title", value: complaint.subject || "—" },
    { field: "Description", value: complaint.description || "—" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Convert to Lead</DialogTitle>
          <DialogDescription>
            This will create a new Lead from {complaint.complaintNumber}'s own details and mark this complaint as
            converted. This action cannot be undone.
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
          <Label htmlFor="convert-to-lead-reason">Reason (optional)</Label>
          <Textarea
            id="convert-to-lead-reason"
            placeholder="Customer actually wants a new quotation, not a warranty repair"
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
            {submitting ? "Converting..." : "Convert to Lead"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
