import { useState } from "react";
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
import { Spinner } from "@/components/ui/spinner";
import LeadSelect from "@/components/quotations/LeadSelect";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/errors";
import { generateQuotationFromLead } from "@/api/quotations";

interface GenerateQuotationFromLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerated: (quotationId: string) => void;
}

// Second entry point for the same one-click "Generate Quotation" action
// already on Lead Details (generateQuotationFromLead()) — reachable
// directly from the Quotations module, for staff who start from "I need to
// quote someone" rather than from a specific lead's page. No items/customer
// to fill in here either: the backend derives everything from the chosen
// Lead's own linked products, same as it always has. Folds in the same
// "confirm you have enough site information" reminder ConfirmQuotationDialog
// shows on Lead Details, rather than duplicating that as a second dialog.
export default function GenerateQuotationFromLeadDialog({
  open,
  onOpenChange,
  onGenerated,
}: GenerateQuotationFromLeadDialogProps) {
  const [leadId, setLeadId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function handleOpenChange(next: boolean) {
    if (!submitting) {
      if (!next) {
        setLeadId("");
        setError("");
      }
      onOpenChange(next);
    }
  }

  async function handleGenerate() {
    if (!leadId) return;
    setSubmitting(true);
    setError("");
    try {
      const quotation = await generateQuotationFromLead(leadId);
      toast.success("Quotation generated.");
      setLeadId("");
      onOpenChange(false);
      onGenerated(quotation.id);
    } catch (err) {
      const message = getErrorMessage(err, "Could not generate a quotation for this lead. Please try again.");
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent onClose={() => handleOpenChange(false)} size="sm">
        <DialogHeader>
          <DialogTitle>Generate Quotation from Lead</DialogTitle>
          <DialogDescription>
            Pick a Qualified lead to quote. Items, quantities, and pricing come straight from the
            products already linked to that lead — nothing else to fill in here. Before
            continuing, confirm you have enough site information to pick the right product —
            either from a completed site visit or ceiling/structure details the customer has
            already sent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <Label htmlFor="generate-quotation-lead">Lead</Label>
          <LeadSelect id="generate-quotation-lead" value={leadId} onChange={setLeadId} />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleGenerate} disabled={submitting || !leadId}>
            {submitting && <Spinner className="mr-2 h-4 w-4" />}
            {submitting ? "Generating..." : "Generate Quotation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
