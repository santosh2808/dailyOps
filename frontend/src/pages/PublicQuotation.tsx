import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Download, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PageLoader from "@/components/PageLoader";
import AcceptQuotationDialog from "@/components/public-quotation/AcceptQuotationDialog";
import RejectQuotationDialog from "@/components/public-quotation/RejectQuotationDialog";
import { toast } from "@/lib/toast";
import {
  acceptPublicQuotation,
  getPublicQuotation,
  openPublicQuotationPdf,
  rejectPublicQuotation,
  type PublicQuotationView,
} from "@/api/public-quotations";

// Customer Quotation Acceptance workflow — the public, unauthenticated page
// reached from the "View Quotation" link in the Send Quotation email
// (requirement #2/#3). No DailyOps login exists or is required here; the
// page identifies the quotation purely from the :token in the URL. Every
// state below (loading / invalid / expired / decided / open) is driven by
// what PublicQuotationsController + QuotationsService actually return —
// nothing is assumed client-side (e.g. "accepted" is only ever shown once
// the accept call has actually succeeded).

function formatCurrency(value?: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm text-slate-900">{value || "—"}</p>
    </div>
  );
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
    <div className="flex min-h-screen flex-col bg-slate-50">
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

export default function PublicQuotation() {
  const { token = "" } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [expiredNumber, setExpiredNumber] = useState<string | null>(null);
  const [quotation, setQuotation] = useState<PublicQuotationView | null>(null);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const fetchQuotation = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    setLoadError(false);
    setExpiredNumber(null);
    try {
      const result = await getPublicQuotation(token);
      if (result.expired) {
        setExpiredNumber(result.quotationNumber);
      } else {
        setQuotation(result.quotation);
      }
    } catch (err: any) {
      // A genuinely invalid/unknown token gets a 404 — requirement #11
      // says that always gets exactly this generic message, never a
      // distinguishable "not found" vs. "bad format" response that would
      // help someone enumerate tokens. Anything else (no response at all,
      // or a 5xx) is a transient failure on OUR end, not a sign the link is
      // wrong — telling the customer their perfectly good link is "invalid"
      // during a deploy or an outage just makes them give up or call in, so
      // that gets its own retryable message instead.
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
    fetchQuotation();
  }, [fetchQuotation]);

  async function handleAccept(payload: { name: string; designation?: string; comment?: string }) {
    try {
      const result = await acceptPublicQuotation(token, { ...payload, confirm: true });
      setAcceptOpen(false);
      toast.success(`Your quotation ${result.quotationNumber} has been accepted.`);
      await fetchQuotation();
    } catch (err) {
      // A stale tab can fail here for a real reason (someone already
      // decided elsewhere, or the offer expired while this tab sat open) —
      // refresh so the page reflects that immediately instead of leaving
      // Accept/Reject visible for another doomed attempt, then let the
      // dialog's own catch show the actual error message.
      await fetchQuotation();
      throw err;
    }
  }

  async function handleReject(payload: { reason: string; comment?: string }) {
    try {
      const result = await rejectPublicQuotation(token, payload);
      setRejectOpen(false);
      toast.success(`Your response for quotation ${result.quotationNumber} has been recorded.`);
      await fetchQuotation();
    } catch (err) {
      await fetchQuotation();
      throw err;
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <BrandHeader />
        <PageLoader label="Loading your quotation..." />
      </div>
    );
  }

  if (notFound) {
    return (
      <CenteredMessage
        title="Quotation Not Found"
        description="This quotation link is invalid. Please check the link or contact Smart Rotamach for assistance."
        icon={<XCircle className="h-10 w-10 text-destructive" />}
      />
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <BrandHeader />
        <div className="flex flex-1 items-center justify-center px-4">
          <Card className="max-w-md text-center">
            <CardContent className="flex flex-col items-center gap-3 py-10">
              <XCircle className="h-10 w-10 text-amber-500" />
              <h1 className="text-lg font-semibold text-slate-900">Something Went Wrong</h1>
              <p className="text-sm text-muted-foreground">
                We couldn't load this quotation right now. Your link is fine — please try again in a
                moment.
              </p>
              <Button onClick={() => fetchQuotation()}>Try Again</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (expiredNumber) {
    return (
      <CenteredMessage
        title="Link Expired"
        description={`This link for quotation ${expiredNumber} has expired. Please contact Smart Rotamach for an updated quotation.`}
        icon={<XCircle className="h-10 w-10 text-amber-500" />}
      />
    );
  }

  if (!quotation) return null;

  // Requirement #4/#5 — "Confirm Acceptance Successfully" / rejected
  // confirmation states. Accept/Reject buttons only ever show while the
  // quotation is still SENT or VIEWED (i.e. undecided) — never on a stale
  // tab that's already moved on, and never re-decidable once decided.
  const isDecided = quotation.status === "ACCEPTED" || quotation.status === "REJECTED";

  return (
    <div className="min-h-screen bg-slate-50">
      <BrandHeader />

      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        {quotation.status === "ACCEPTED" && (
          <Card className="border-emerald-200 bg-emerald-50">
            <CardContent className="flex items-center gap-3 py-5">
              <CheckCircle2 className="h-6 w-6 flex-shrink-0 text-emerald-600" />
              <div>
                <p className="font-medium text-emerald-900">Quotation Accepted Successfully</p>
                <p className="text-sm text-emerald-800">
                  Thank you. Your quotation {quotation.quotationNumber} has been accepted.
                  {quotation.acceptedByName ? ` — ${quotation.acceptedByName}` : ""}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {quotation.status === "REJECTED" && (
          <Card className="border-slate-300 bg-slate-100">
            <CardContent className="flex items-center gap-3 py-5">
              <XCircle className="h-6 w-6 flex-shrink-0 text-slate-500" />
              <div>
                <p className="font-medium text-slate-900">Quotation Rejected</p>
                <p className="text-sm text-slate-700">
                  Your response for quotation {quotation.quotationNumber} has been recorded.
                  {quotation.rejectionReason ? ` Reason: ${quotation.rejectionReason}.` : ""}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="text-xl">Quotation {quotation.quotationNumber}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">from Smart Rotamach</p>
            </div>
            <Button variant="outline" onClick={() => openPublicQuotationPdf(token)}>
              <Download className="mr-2 h-4 w-4" />
              View / Download PDF
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
              <Field label="Quotation Date" value={formatDate(quotation.quotationDate)} />
              <Field label="Valid Until" value={formatDate(quotation.validUntil)} />
              <Field label="Customer Name" value={quotation.customerName} />
              <Field label="Company" value={quotation.customerCompany} />
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Unit Price</TableHead>
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotation.items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>{item.description || item.productName}</TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>{formatCurrency(item.unitPrice)}</TableCell>
                      <TableCell>{formatCurrency(item.lineTotal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="ml-auto max-w-xs space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(quotation.subtotal)}</span>
              </div>
              {quotation.installationCharge > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Installation</span>
                  <span>{formatCurrency(quotation.installationCharge)}</span>
                </div>
              )}
              {quotation.transportationCharge > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Transportation</span>
                  <span>{formatCurrency(quotation.transportationCharge)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">GST ({quotation.gstPercent}%)</span>
                <span>{formatCurrency(quotation.gstAmount)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 text-base font-semibold text-slate-900">
                <span>Grand Total</span>
                <span>{formatCurrency(quotation.grandTotal)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Payment Terms" value={quotation.paymentTerms} />
              <Field label="Delivery Terms" value={quotation.deliveryTerms} />
            </div>
            {quotation.terms && <Field label="Terms & Conditions" value={quotation.terms} />}
            {quotation.notes && <Field label="Notes" value={quotation.notes} />}
          </CardContent>
        </Card>

        {!isDecided && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-6 sm:flex-row sm:justify-center">
              <Button size="lg" onClick={() => setAcceptOpen(true)}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Accept Quotation
              </Button>
              <Button size="lg" variant="destructive" onClick={() => setRejectOpen(true)}>
                <XCircle className="mr-2 h-4 w-4" />
                Reject Quotation
              </Button>
            </CardContent>
          </Card>
        )}

        <p className="pb-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Smart Rotamach. All rights reserved.
        </p>
      </div>

      <AcceptQuotationDialog
        open={acceptOpen}
        onOpenChange={setAcceptOpen}
        quotationNumber={quotation.quotationNumber}
        onConfirm={handleAccept}
      />
      <RejectQuotationDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        quotationNumber={quotation.quotationNumber}
        onConfirm={handleReject}
      />
    </div>
  );
}
