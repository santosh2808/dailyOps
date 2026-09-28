import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import PageLoader from "@/components/PageLoader";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/errors";
import {
  approvePublicApproval,
  getPublicApproval,
  rejectPublicApproval,
  type PublicApprovalView,
} from "@/api/public-approvals";
import { DISPATCH_OVERRIDE_APPROVERS } from "@/types";

// Override Approval workflow — the public, unauthenticated page reached
// from the "Approval Requested" email sent to Santosh Kumar Chegondi /
// Amarpal Gampa (neither of whom has a DailyOps account). Sibling to
// PublicQuotation.tsx's /quote/:token page: no login exists or is required
// here, the page identifies the request purely from the :token in the URL,
// and every state below is driven by what PublicApprovalsController +
// ApprovalDecisionsService actually return — nothing is assumed
// client-side.

function formatRupees(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function typeLabel(type: PublicApprovalView["type"]) {
  switch (type) {
    case "SALES_ORDER_DISPATCH":
      return "Sales Order Dispatch";
    case "PROFORMA_INVOICE_ADVANCE":
      return "Proforma Invoice Advance";
    case "JEO_PRODUCTION_START":
      return "Production Start (JEO)";
    default:
      return "Override Approval";
  }
}

function BrandHeader() {
  return (
    <header className="flex items-center border-b border-slate-200 bg-gradient-to-r from-[#eef6da] via-white to-[#fdeceb] px-6 py-3">
      <img src="/sr-dailyops-logo-full.png" alt="Smart Rotamach" className="h-14 w-auto" />
    </header>
  );
}

function CenteredMessage({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <BrandHeader />
      <div className="flex flex-1 items-center justify-center px-4">
        <Card className="max-w-md text-center">
          <CardContent className="flex flex-col items-center gap-3 py-10">
            {icon}
            <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

type Mode = "view" | "approve" | "reject";

export default function PublicApproval() {
  const { token = "" } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [request, setRequest] = useState<PublicApprovalView | null>(null);

  const [mode, setMode] = useState<Mode>("view");
  const [approverName, setApproverName] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const fetchRequest = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    setLoadError(false);
    try {
      const result = await getPublicApproval(token);
      setRequest(result);
    } catch (err: any) {
      // Same anti-enumeration convention as PublicQuotation.tsx: a
      // genuinely invalid/unknown token gets a 404, generic message.
      // Anything else is a transient failure on our end, not a sign the
      // link is wrong.
      if (err?.response?.status === 404) {
        setNotFound(true);
      } else {
        setLoadError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchRequest();
  }, [fetchRequest]);

  function startDecision(nextMode: "approve" | "reject") {
    setMode(nextMode);
    setApproverName("");
    setNote("");
    setSubmitError("");
  }

  function cancelDecision() {
    setMode("view");
    setSubmitError("");
  }

  async function handleSubmit() {
    if (!approverName) {
      setSubmitError("Select your name before continuing.");
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      const action = mode === "approve" ? approvePublicApproval : rejectPublicApproval;
      const result = await action(token, { approverName, note: note.trim() || undefined });
      toast.success(
        result.status === "APPROVED" ? "Approved. The action has been applied." : "Rejected.",
      );
      setMode("view");
      await fetchRequest();
    } catch (err) {
      const message = getErrorMessage(err, "Could not record your decision. Please try again.");
      setSubmitError(message);
      toast.error(message);
      // A decision can fail because someone else already decided this
      // request in the meantime (or the link expired while this tab sat
      // open) — refresh so the page reflects that immediately.
      await fetchRequest();
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col bg-slate-50">
        <BrandHeader />
        <PageLoader label="Loading approval request..." />
      </div>
    );
  }

  if (notFound) {
    return (
      <CenteredMessage
        title="Approval Link Not Found"
        description="This approval link is invalid. Please check the link or contact Smart Rotamach for assistance."
        icon={<XCircle className="h-10 w-10 text-destructive" />}
      />
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-dvh flex-col bg-slate-50">
        <BrandHeader />
        <div className="flex flex-1 items-center justify-center px-4">
          <Card className="max-w-md text-center">
            <CardContent className="flex flex-col items-center gap-3 py-10">
              <XCircle className="h-10 w-10 text-amber-500" />
              <h1 className="text-lg font-semibold text-slate-900">Something Went Wrong</h1>
              <p className="text-sm text-muted-foreground">
                We couldn't load this approval request right now. Your link is fine — please try again
                in a moment.
              </p>
              <Button onClick={() => fetchRequest()}>Try Again</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!request) return null;

  const isPending = request.status === "PENDING";

  return (
    <div className="min-h-dvh bg-slate-50">
      <BrandHeader />

      <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        {request.status === "APPROVED" && (
          <Card className="border-emerald-200 bg-emerald-50">
            <CardContent className="flex items-center gap-3 py-5">
              <CheckCircle2 className="h-6 w-6 flex-shrink-0 text-emerald-600" />
              <div>
                <p className="font-medium text-emerald-900">Approved</p>
                <p className="text-sm text-emerald-800">
                  {request.decidedApprover ? `${request.decidedApprover} approved this. ` : ""}
                  The action has been applied.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {request.status === "REJECTED" && (
          <Card className="border-slate-300 bg-slate-100">
            <CardContent className="flex items-center gap-3 py-5">
              <XCircle className="h-6 w-6 flex-shrink-0 text-slate-500" />
              <div>
                <p className="font-medium text-slate-900">Rejected</p>
                <p className="text-sm text-slate-700">
                  {request.decidedApprover ? `${request.decidedApprover} rejected this.` : "This request was rejected."}
                  {request.decisionNote ? ` Note: ${request.decisionNote}` : ""}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {request.status === "EXPIRED" && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="flex items-center gap-3 py-5">
              <Clock className="h-6 w-6 flex-shrink-0 text-amber-600" />
              <div>
                <p className="font-medium text-amber-900">Link Expired</p>
                <p className="text-sm text-amber-800">
                  This approval link has expired. Please contact the sales team for an updated request.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {request.status === "FAILED" && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="flex items-center gap-3 py-5">
              <XCircle className="h-6 w-6 flex-shrink-0 text-destructive" />
              <div>
                <p className="font-medium text-destructive">Approved, but applying it failed</p>
                <p className="text-sm text-muted-foreground">
                  {request.decidedApprover ? `${request.decidedApprover} approved this, ` : "This was approved, "}
                  but the action could not be applied
                  {request.resultError ? `: ${request.resultError}` : "."} Please contact IT/Santosh
                  directly.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{typeLabel(request.type)} — Approval Needed</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">from Smart Rotamach DailyOps</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Action</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{request.actionSummary}</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Requested By
                </p>
                <p className="mt-1 text-sm text-slate-900">{request.requestedByName || "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Requested At
                </p>
                <p className="mt-1 text-sm text-slate-900">{formatDateTime(request.requestedAt)}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Advance Received
                </p>
                <p className="mt-1 text-sm text-slate-900">{formatRupees(request.advanceReceived)}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Required Advance
                </p>
                <p className="mt-1 text-sm text-slate-900">{formatRupees(request.requiredAdvance)}</p>
              </div>
            </div>
            {!isPending && (
              <p className="text-xs text-muted-foreground">
                This link expired or was already decided at {formatDateTime(request.tokenExpiresAt)}.
              </p>
            )}
          </CardContent>
        </Card>

        {isPending && mode === "view" && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-6 sm:flex-row sm:justify-center">
              <Button size="lg" onClick={() => startDecision("approve")}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Approve
              </Button>
              <Button size="lg" variant="destructive" onClick={() => startDecision("reject")}>
                <XCircle className="mr-2 h-4 w-4" />
                Reject
              </Button>
            </CardContent>
          </Card>
        )}

        {isPending && mode !== "view" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {mode === "approve" ? "Confirm Approval" : "Confirm Rejection"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="approver-name">Your Name (required)</Label>
                <Select
                  id="approver-name"
                  value={approverName}
                  onChange={(e) => setApproverName(e.target.value)}
                >
                  <option value="">Select...</option>
                  {DISPATCH_OVERRIDE_APPROVERS.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="decision-note">Note (optional)</Label>
                <Textarea
                  id="decision-note"
                  placeholder={
                    mode === "approve"
                      ? "e.g. Customer confirmed payment on delivery."
                      : "e.g. Please collect the balance advance first."
                  }
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
              {submitError && <p className="text-sm text-destructive">{submitError}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={cancelDecision} disabled={submitting}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant={mode === "reject" ? "destructive" : "default"}
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting && <Spinner className="mr-2 h-4 w-4" />}
                  {submitting
                    ? "Submitting..."
                    : mode === "approve"
                      ? "Confirm Approval"
                      : "Confirm Rejection"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <p className="pb-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Smart Rotamach. All rights reserved.
        </p>
      </div>
    </div>
  );
}
