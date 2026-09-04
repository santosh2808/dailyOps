import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmPriceIncludesChargesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
  onAnswer: (includesChargesAndGst: boolean) => void;
}

// Shown when staff raise a quotation item's unit price above the product's
// own catalog price — a common way of quietly folding installation,
// transportation, and GST into one round number instead of listing them
// separately. Asking here (rather than guessing) is the only reliable way
// to know: the same "price above list" can mean either "this fan alone
// costs more" or "this price already covers everything". Answering Yes
// tells QuotationsService.computeTotals() to stop adding installation/
// transportation/GST on top of the entered prices and instead show GST as
// already included (back-calculated); No leaves today's normal additive
// behavior in place.
export default function ConfirmPriceIncludesChargesDialog({
  open,
  onOpenChange,
  productName,
  onAnswer,
}: ConfirmPriceIncludesChargesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Does this price include everything?</DialogTitle>
          <DialogDescription>
            The price entered for <span className="font-medium text-slate-900">{productName}</span> is
            higher than its catalog price. Does this already include installation, transportation,
            and GST?
          </DialogDescription>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          If yes, the Installation and Transportation charge fields below are cleared (they're
          already folded into this price), and GST is shown as included rather than added on top.
          If no, keep entering Installation/Transportation charges separately as usual.
        </p>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              onAnswer(false);
            }}
          >
            No, charge separately
          </Button>
          <Button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onAnswer(true);
            }}
          >
            Yes, already included
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
