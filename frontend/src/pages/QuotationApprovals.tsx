import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, XCircle } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { decideQuotationApproval, listQuotationApprovalRequests } from "@/api/quotations";
import type { QuotationApprovalRequest } from "@/types";

// Requirement #9's "reusable approval engine" surfaces here as the
// Approvals inbox: every QuotationApprovalRequest the Approval Matrix (or
// the below-minimum-price hard floor) has ever produced, with Approve /
// Reject actions. Deciding "Approve" performs the full ACCEPTED cascade
// server-side (see QuotationsService.decideApprovalRequest()) — this page
// never has to separately create the Sales Order etc. itself.

const STATUS_FILTERS = ["PENDING", "APPROVED", "REJECTED", ""] as const;

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function QuotationApprovals() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>("PENDING");
  const [requests, setRequests] = useState<QuotationApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRequests(await listQuotationApprovalRequests(statusFilter || undefined));
    } catch {
      setError("Could not load approval requests.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  async function handleDecide(requestId: string, approve: boolean) {
    setDecidingId(requestId);
    setError("");
    try {
      await decideQuotationApproval(requestId, approve);
      await fetchRequests();
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          "Could not record this decision. Please try again.",
      );
    } finally {
      setDecidingId(null);
    }
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="Quotation Approvals" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex items-center justify-between">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-48"
            >
              {STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>
                  {s || "All statuses"}
                </option>
              ))}
            </Select>
          </div>

          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quotation</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Discount %</TableHead>
                <TableHead>Below Min Price</TableHead>
                <TableHead>Requested By</TableHead>
                <TableHead>Requested At</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                    Loading approval requests...
                  </TableCell>
                </TableRow>
              ) : requests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                    No approval requests found.
                  </TableCell>
                </TableRow>
              ) : (
                requests.map((request) => (
                  <TableRow
                    key={request.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/quotations/${request.quotationId}`)}
                  >
                    <TableCell className="font-medium text-slate-900">
                      {request.quotation?.quotationNumber ?? request.quotationId}
                    </TableCell>
                    <TableCell>{request.quotation?.customer?.companyName ?? "—"}</TableCell>
                    <TableCell className="max-w-xs truncate">{request.reason || "—"}</TableCell>
                    <TableCell>
                      {request.discountPercent != null ? `${request.discountPercent.toFixed(1)}%` : "—"}
                    </TableCell>
                    <TableCell>{request.belowMinPrice ? "Yes" : "No"}</TableCell>
                    <TableCell>{request.requestedBy || "—"}</TableCell>
                    <TableCell>{formatDateTime(request.requestedAt)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          request.status === "APPROVED"
                            ? "success"
                            : request.status === "REJECTED"
                              ? "destructive"
                              : "warning"
                        }
                      >
                        {request.status}
                      </Badge>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {request.status === "PENDING" ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Approve"
                            disabled={decidingId === request.id}
                            onClick={() => handleDecide(request.id, true)}
                          >
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Reject"
                            disabled={decidingId === request.id}
                            onClick={() => handleDecide(request.id, false)}
                          >
                            <XCircle className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ) : (
                        <div className="text-right text-xs text-muted-foreground">
                          {request.decidedBy ? `by ${request.decidedBy}` : ""}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </main>
      </div>
    </div>
  );
}
