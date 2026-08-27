import { useEffect, useRef, useState } from "react";
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
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { updateTaxInvoiceEInvoice } from "@/api/tax-invoices";
import type { TaxInvoice } from "@/types";

// GST e-invoicing (IRN + QR): the government e-invoice portal (or a GSP)
// issues the IRN, acknowledgement details, and a signed QR code once an
// invoice is reported to it — this app doesn't do that reporting itself
// (no confirmed live API integration), so whoever generates the e-invoice
// externally pastes the results in here. The QR is uploaded as an image
// file and stored/rendered exactly as received.

interface EInvoiceDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: TaxInvoice | null;
  onSaved: (updated: TaxInvoice) => void;
}

function toDateInputValue(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export default function EInvoiceDetailsDialog({
  open,
  onOpenChange,
  invoice,
  onSaved,
}: EInvoiceDetailsDialogProps) {
  const [irn, setIrn] = useState("");
  const [ackNumber, setAckNumber] = useState("");
  const [ackDate, setAckDate] = useState("");
  const [qrCodeImage, setQrCodeImage] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && invoice) {
      setIrn(invoice.irn ?? "");
      setAckNumber(invoice.ackNumber ?? "");
      setAckDate(toDateInputValue(invoice.ackDate));
      setQrCodeImage(invoice.qrCodeImage ?? undefined);
      setError("");
    }
  }, [open, invoice]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file (PNG or JPG) of the QR code.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setQrCodeImage(typeof reader.result === "string" ? reader.result : undefined);
      setError("");
    };
    reader.onerror = () => setError("Could not read that image file. Please try again.");
    reader.readAsDataURL(file);
  }

  async function handleConfirm() {
    if (!invoice) return;
    setSubmitting(true);
    setError("");
    try {
      const updated = await updateTaxInvoiceEInvoice(invoice.id, {
        irn: irn.trim() || undefined,
        ackNumber: ackNumber.trim() || undefined,
        ackDate: ackDate || undefined,
        qrCodeImage,
      });
      toast.success("e-Invoice details saved.");
      onSaved(updated);
      onOpenChange(false);
    } catch (err: any) {
      const message =
        err?.response?.data?.message || "Could not save e-Invoice details. Please try again.";
      setError(Array.isArray(message) ? message.join(" ") : message);
      toast.error(Array.isArray(message) ? message.join(" ") : message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>GST e-Invoice Details</DialogTitle>
          <DialogDescription>
            Paste the IRN and acknowledgement details, and upload the QR code image, after
            generating the e-invoice on the government portal or your GSP. This is not generated
            automatically by DailyOps.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="einvoice-irn">IRN (Invoice Reference Number)</Label>
            <Input
              id="einvoice-irn"
              value={irn}
              onChange={(e) => setIrn(e.target.value)}
              placeholder="64-character IRN from the e-invoice portal"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="einvoice-ack-number">Acknowledgement No.</Label>
              <Input
                id="einvoice-ack-number"
                value={ackNumber}
                onChange={(e) => setAckNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="einvoice-ack-date">Acknowledgement Date</Label>
              <Input
                id="einvoice-ack-date"
                type="date"
                value={ackDate}
                onChange={(e) => setAckDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="einvoice-qr-file">QR Code Image</Label>
            <Input
              id="einvoice-qr-file"
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
            />
            {qrCodeImage && (
              <div className="flex items-center gap-3 pt-1">
                <img
                  src={qrCodeImage}
                  alt="QR code preview"
                  className="h-20 w-20 rounded border object-contain"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setQrCodeImage(undefined);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                >
                  Remove
                </Button>
              </div>
            )}
          </div>
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
          <Button type="button" onClick={handleConfirm} disabled={submitting}>
            {submitting && <Spinner className="mr-2 h-4 w-4" />}
            {submitting ? "Saving..." : "Save e-Invoice Details"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
