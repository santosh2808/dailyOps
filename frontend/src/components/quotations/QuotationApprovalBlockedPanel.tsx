import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  requestQuotationApproval,
  type QuotationApprovalErrorBody,
  type QuotationApprovalPurpose,
} from "@/api/quotations";

function formatCurrency(value?: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

interface QuotationApprovalBlockedPanelProps {
  quotationId: string;
  blockedBy: QuotationApprovalErrorBody;
  // ACCEPT: the request, once approved, accepts the quotation. SEND: it
  // approves the pricing so the quotation can then be sent.
  purpose: QuotationApprovalPurpose;
  onBack: () => void;
  onClose: () => void;
}

// Price Validation (req #8) / Approval Matrix (req #9): shown in place of a
// dialog's normal content when the backend refuses to accept or send a
// quotation with its structured 400 body — the specifics (entered/minimum/
// difference, or the required role) plus "Update Price" / "Request
// Approval".
export default function QuotationApprovalBlockedPanel({
  quotationId,
  blockedBy,
  purpose,
  onBack,
  onClose,
}: QuotationApprovalBlockedPanelProps) {
  const navigate = useNavigate();
  const [requestReason, setRequestReason] = useState("");
  const [requestingApproval, setRequestingApproval] = useState(false);
  const [approvalRequested, setApprovalRequested] = useState(false);
  const [error, setError] = useState("");

  function handleUpdatePrice() {
    onClose();
    navigate(`/quotations/${quotationId}/edit`);
  }

  async function handleRequestApproval() {
    setRequestingApproval(true);
    setError("");
    try {
      await requestQuotationApproval(quotationId, requestReason || undefined, purpose);
      setApprovalRequested(true);
      toast.success("Approval request submitted.");
    } catch (err: any) {
      const message =
        err?.response?.data?.message || "Could not submit the approval request. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setRequestingApproval(false);
    }
  }

  if (approvalRequested) {
    return (
      <>
        <p className="text-sm text-emerald-700">
          {purpose === "SEND"
            ? "Approval request submitted. Once it is approved, send the quotation again."
            : "Approval request submitted. It now appears in the Approvals inbox for the required approver to decide."}
        </p>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      {blockedBy.code === "PRICE_BELOW_MINIMUM" ? (
        <div className="space-y-3">
          <p className="text-sm text-destructive">{blockedBy.message}</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Entered</TableHead>
                <TableHead>Minimum</TableHead>
                <TableHead>Difference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {blockedBy.items?.map((item) => (
                <TableRow key={item.productId}>
                  <TableCell>{item.productName}</TableCell>
                  <TableCell>{formatCurrency(item.enteredPrice)}</TableCell>
                  <TableCell>{formatCurrency(item.minimumPrice)}</TableCell>
                  <TableCell className="text-destructive">{formatCurrency(item.difference)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-destructive">{blockedBy.message}</p>
      )}

      <div className="mt-3 space-y-2">
        <Label htmlFor="approval-reason">Reason for approval (optional)</Label>
        <Textarea
          id="approval-reason"
          value={requestReason}
          onChange={(e) => setRequestReason(e.target.value)}
          placeholder="Explain why this quotation should be approved as-is..."
        />
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        {blockedBy.code === "PRICE_BELOW_MINIMUM" && (
          <Button type="button" variant="outline" onClick={handleUpdatePrice}>
            Update Price
          </Button>
        )}
        <Button type="button" onClick={handleRequestApproval} disabled={requestingApproval}>
          {requestingApproval && <Spinner className="mr-2 h-4 w-4" />}
          {requestingApproval ? "Submitting..." : "Request Approval"}
        </Button>
      </DialogFooter>
    </>
  );
}
