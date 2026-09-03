import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { TaxInvoice } from "@/types";

interface ConfirmSendMissingQrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: TaxInvoice | null;
  onContinue: () => void;
}

// Soft, non-blocking reminder shown before Send/Resend when the customer is
// GST-registered but no IRN/QR code has been added yet. Not a hard gate:
// e-invoicing may not even apply to this business (turnover threshold), and
// blocking Send outright would stop normal invoicing for everyone if the
// e-invoice portal response is delayed or e-invoicing isn't mandatory here.
// Continue always proceeds straight to the real Send dialog.
export default function ConfirmSendMissingQrDialog({
  open,
  onOpenChange,
  invoice,
  onContinue,
}: ConfirmSendMissingQrDialogProps) {
  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Send Without QR Code?</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-slate-900">{invoice.customer?.companyName}</span> is
            GST-registered, but this invoice has no e-invoice IRN/QR code added yet. If e-invoicing
            applies to your business, add the QR code first (GST e-Invoice card below) so the PDF
            is compliant. Otherwise it's fine to send as-is.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onContinue();
            }}
          >
            Send Anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
