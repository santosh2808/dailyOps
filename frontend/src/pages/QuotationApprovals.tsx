import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Eye, XCircle } from "lucide-react";
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
import { MobileRecordList, ResponsiveRecords } from "@/components/shared/MobileRecordList";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/errors";
import { decideQuotationApproval, listQuotationApprovalRequests } from "@/api/quotations";
import type { QuotationApprovalRequest } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationsContext";

// Requirement #9's "reusable approval engine" surfaces here as the
// Approvals inbox: every QuotationApprovalRequest the Approval Matrix (or
// the below-minimum-price hard floor) has ever produced, with Approve /
// Reject actions. Approving a request "to accept" only moves the quotation
// to ACCEPTED; approving one "to send" only approves its pricing, so the
// requester can then send it (see QuotationsService.decideApprovalRequest())
// — per the
// QA bug-fix pass (TC-088), it no longer auto-creates a Sales Order; that's
// now always the separate "Create Sales Order" action on Quotation/Customer
// Details, same as every other acceptance route.

const STATUS_FILTERS = ["", "PENDING", "APPROVED", "REJECTED"] as const;

function purposeLabel(request: QuotationApprovalRequest) {
  return request.purpose === "SEND" ? "To send to customer" : "To accept";
}

// Why the current user can't decide this request, or null if they can.
// Mirrors QuotationsService.decideApprovalRequest(): Administrator, or the
// role the request needs (`requiredApprover`, from the server). Only here
// so nobody tries and fails — the server still enforces it.
function decideBlockedReason(request: QuotationApprovalRequest, roles: string[]) {
  const required = request.requiredApprover;
  if (!required || roles.includes("Administrator") || roles.includes(required)) return null;
  if (required === "Administrator") {
    return request.belowMinPrice
      ? "Only an Administrator can approve or reject this — the price is below the minimum allowed."
      : "Only an Administrator can approve or reject this discount.";
  }
  return `Only a ${required} or an Administrator can approve or reject this discount.`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function QuotationApprovals() {
  const navigate = useNavigate();
  // QA bug-fix pass (TC-095): the Sidebar entry that links here is already
  // gated on Quotation.Approve (see Sidebar.tsx), and the backend's decide
  // endpoint enforces it too — this adds the same check directly in front
  // of the Approve/Reject buttons themselves, so a user who reaches this
  // page any other way (direct URL, browser back/forward) still can't see
  // action buttons they have no permission to use.
  const { hasPermission, user } = useAuth();
  const userRoles = user?.roles ?? [];
  const { refresh: refreshNotifications } = useNotifications();
  const canApprove = hasPermission("Quotation", "Approve");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [requests, setRequests] = useState<QuotationApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRequests(await listQuotationApprovalRequests(statusFilter || undefined));
    } catch (err) {
      const message = getErrorMessage(err, "Could not load approval requests.");
      setError(message);
      toast.error(message);
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
      const result = await decideQuotationApproval(requestId, approve);
      toast.success(
        !approve
          ? "Quotation rejected."
          : result.purpose === "SEND"
            ? "Pricing approved. The quotation can now be sent."
            : "Quotation approved.",
      );
      await fetchRequests();
      // The sidebar's pending count just dropped.
      refreshNotifications();
    } catch (err: any) {
      const message =
        err?.response?.data?.message || "Could not record this decision. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setDecidingId(null);
    }
  }

  // Row actions (or the "by <decider>" note once decided), shared by the
  // table's Actions cell and the mobile card.
  // `showNote`: the mobile card spells out why the buttons are disabled —
  // there's no hover on a phone to show the tooltip.
  function approvalActions(request: QuotationApprovalRequest, showNote = false) {
    const blockedReason = decideBlockedReason(request, userRoles);
    return (
      <>
        {request.status === "PENDING" && canApprove ? (
          <div className="flex flex-col items-end gap-1">
            {/* The tooltip sits on a wrapper: browsers don't show a disabled button's own title. */}
            <div className="flex justify-end gap-1" title={blockedReason ?? undefined}>
              <Button
                variant="ghost"
                size="icon"
                title={blockedReason ? undefined : "Approve"}
                aria-label={blockedReason ? `Approve — ${blockedReason}` : "Approve"}
                disabled={decidingId === request.id || !!blockedReason}
                onClick={() => handleDecide(request.id, true)}
              >
                {decidingId === request.id ? (
                  <Spinner className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title={blockedReason ? undefined : "Reject"}
                aria-label={blockedReason ? `Reject — ${blockedReason}` : "Reject"}
                disabled={decidingId === request.id || !!blockedReason}
                onClick={() => handleDecide(request.id, false)}
              >
                {decidingId === request.id ? (
                  <Spinner className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
              </Button>
            </div>
            {showNote && blockedReason && (
              <p className="text-right text-xs text-muted-foreground">{blockedReason}</p>
            )}
          </div>
        ) : (
          <div className="text-right text-xs text-muted-foreground">
            {request.decidedBy ? `by ${request.decidedBy}` : ""}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="app-shell bg-app-grid">
      <Sidebar />
      <div className="app-shell-content">
        <Topbar title="Quotation Approvals" />
        <main className="app-shell-main app-shell-main-list">
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

          <ResponsiveRecords
            table={
              <Table fillHeightOnMobile>
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
                        <span className="inline-flex items-center gap-2">
                          <Spinner /> Loading approval requests...
                        </span>
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
                          <span className="block text-xs font-normal text-muted-foreground">
                            {purposeLabel(request)}
                          </span>
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
                          {approvalActions(request)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            }
            mobile={
              <MobileRecordList
                rows={requests}
                getKey={(request) => request.id}
                title={(request) => request.quotation?.quotationNumber ?? request.quotationId}
                badge={(request) => (
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
                )}
                subtitle={(request) => request.quotation?.customer?.companyName ?? "—"}
                meta={(request) => `${request.requestedBy || "—"} · ${formatDateTime(request.requestedAt)}`}
                fields={[
                  { label: "Customer", render: (request) => request.quotation?.customer?.companyName ?? "—" },
                  { label: "For", render: purposeLabel },
                  { label: "Reason", render: (request) => request.reason || "—" },
                  {
                    label: "Discount %",
                    render: (request) =>
                      request.discountPercent != null ? `${request.discountPercent.toFixed(1)}%` : "—",
                  },
                  { label: "Below Min Price", render: (request) => (request.belowMinPrice ? "Yes" : "No") },
                  { label: "Requested By", render: (request) => request.requestedBy || "—" },
                  { label: "Requested At", render: (request) => formatDateTime(request.requestedAt) },
                ]}
                // The table opens the quotation by clicking the row; a card
                // tap expands instead, so the card gets an explicit button.
                actions={(request) => (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/quotations/${request.quotationId}`)}>
                      <Eye className="mr-1 h-4 w-4" />
                      Open quotation
                    </Button>
                    {approvalActions(request, true)}
                  </>
                )}
                loading={loading}
                loadingText="Loading approval requests..."
                emptyText="No approval requests found."
              />
            }
          />
        </main>
      </div>
    </div>
  );
}
