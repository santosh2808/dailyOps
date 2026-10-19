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
import { Spinner } from "@/components/ui/spinner";
import GenerateChargesFields, {
  emptyGenerateCharges,
  generateChargesPayload,
  validateGenerateCharges,
  type GenerateCharges,
} from "@/components/quotations/GenerateChargesFields";
import type { Lead } from "@/types";
import type { QuotationPayload } from "@/api/quotations";

interface ConfirmQuotationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
  onConfirm: (charges: Pick<QuotationPayload, "installationCharge" | "transportationCharge" | "transportScope" | "pricesIncludeChargesAndGst">) => Promise<void>;
}

// Soft, non-blocking reminder shown before generating a quotation. A lead
// only reaches "Qualified" (the one status that surfaces this action) via a
// manual status change with no enforced path — a site visit or a customer
// sending ceiling/structure details are both valid ways to get the technical
// info needed to pick the right fan, and there's no reliable way to tell
// which one happened from the lead record alone. So this is a reminder, not
// a gate: Continue always proceeds. handleGenerateQuotation (passed in as
// onConfirm) already owns its own loading/error/toast handling and never
// rethrows, so this dialog just tracks submitting state to disable itself
// meanwhile and always closes once the call settles.
export default function ConfirmQuotationDialog({
  open,
  onOpenChange,
  lead,
  onConfirm,
}: ConfirmQuotationDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [charges, setCharges] = useState<GenerateCharges>(emptyGenerateCharges);
  const [error, setError] = useState("");

  async function handleConfirm() {
    const chargeError = validateGenerateCharges(charges);
    if (chargeError) {
      setError(chargeError);
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await onConfirm(generateChargesPayload(charges));
    } finally {
      setSubmitting(false);
      setCharges(emptyGenerateCharges);
      onOpenChange(false);
    }
  }

  if (!lead) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)} size="md">
        <DialogHeader>
          <DialogTitle>Confirm Before Quoting</DialogTitle>
          <DialogDescription>
            Before generating a quotation for{" "}
            <span className="font-medium text-slate-900">{lead.companyName}</span>, confirm you
            have enough site information to pick the right product — either from a completed site
            visit or ceiling/structure details the customer has already sent. If not, it's best to
            gather that first so the quotation doesn't need reworking later.
          </DialogDescription>
        </DialogHeader>

        <GenerateChargesFields value={charges} onChange={setCharges} idPrefix="confirm-quotation" />
        {error && <p className="text-sm text-destructive">{error}</p>}

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
            {submitting ? "Generating..." : "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
