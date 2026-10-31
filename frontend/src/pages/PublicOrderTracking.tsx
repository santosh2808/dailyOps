import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Circle, MessageCircle, XCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PageLoader from "@/components/PageLoader";
import { getOrderTracking, type OrderTrackingView } from "@/api/public-sales-orders";

// Customer order tracking — the public, unauthenticated /track/:token page
// linked from the sales order WhatsApp messages (order placed, dispatched).
// Read-only: order number, dates and status steps only, as returned by
// PublicSalesOrdersController — nothing else about the order is available
// here, since the link can be forwarded. Same layout and error states as
// PublicQuotation.tsx / PublicApproval.tsx.

// The AiSensy-connected WhatsApp Business number (the one the order
// messages come from, in every environment), so a customer's question
// lands in the team's AiSensy Live Chat.
const SUPPORT_WHATSAPP_NUMBER = "919392502212";

function WhatsAppSupportLink() {
  return (
    <a
      href={`https://wa.me/${SUPPORT_WHATSAPP_NUMBER}`}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonVariants()}
    >
      <MessageCircle className="mr-2 h-4 w-4" />
      Chat with us on WhatsApp
    </a>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function BrandHeader() {
  return (
    <header className="flex items-center border-b border-slate-200 bg-gradient-to-r from-[#eef6da] via-white to-[#fdeceb] px-6 py-3">
      <img src="/sr-dailyops-logo-full.png" alt="Smart Rotamach" className="h-14 w-auto" />
    </header>
  );
}

function CenteredMessage({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <BrandHeader />
      <div className="flex flex-1 items-center justify-center px-4">
        <Card className="max-w-md text-center">
          <CardContent className="flex flex-col items-center gap-3 py-10">
            <XCircle className="h-10 w-10 text-amber-500" />
            <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
            {action}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function PublicOrderTracking() {
  const { token = "" } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [order, setOrder] = useState<OrderTrackingView | null>(null);

  const fetchTracking = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    setLoadError(false);
    try {
      setOrder(await getOrderTracking(token));
    } catch (err: any) {
      // Same convention as PublicQuotation.tsx: only a 404 means the link
      // is wrong; anything else (including the rate limit) is transient.
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
    fetchTracking();
  }, [fetchTracking]);

  // Ask search engines not to index a tracking link if one is ever crawled
  // (best effort — the page is client-rendered).
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col bg-slate-50">
        <BrandHeader />
        <PageLoader label="Loading your order..." />
      </div>
    );
  }

  if (notFound) {
    return (
      <CenteredMessage
        title="Order Not Found"
        description="This tracking link is invalid. Please check the link or contact us on WhatsApp for assistance."
        action={<WhatsAppSupportLink />}
      />
    );
  }

  if (loadError) {
    return (
      <CenteredMessage
        title="Something Went Wrong"
        description="We couldn't load your order right now. Your link is fine — please try again in a moment."
        action={<Button onClick={() => fetchTracking()}>Try Again</Button>}
      />
    );
  }

  if (!order) return null;

  const cancelled = order.status === "CANCELLED";
  // The furthest step reached is "current" — unless the order is cancelled,
  // in which case no step is in progress.
  const currentIndex = cancelled ? -1 : order.steps.reduce((last, step, i) => (step.done ? i : last), -1);

  return (
    <div className="min-h-dvh bg-slate-50">
      <BrandHeader />

      <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        {cancelled && (
          <Card className="border-slate-300 bg-slate-100">
            <CardContent className="flex items-center gap-3 py-5">
              <XCircle className="h-6 w-6 flex-shrink-0 text-slate-500" />
              <div>
                <p className="font-medium text-slate-900">Order Cancelled</p>
                <p className="text-sm text-slate-700">
                  This order was cancelled{order.cancelledAt ? ` on ${formatDate(order.cancelledAt)}` : ""}. Please
                  contact us if you have any questions.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Order {order.salesOrderNumber}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">from Smart Rotamach</p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{order.statusLabel}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Order Date</p>
                <p className="mt-1 text-sm text-slate-900">{formatDate(order.orderDate)}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Expected Delivery
                </p>
                <p className="mt-1 text-sm text-slate-900">{formatDate(order.deliveryDate)}</p>
              </div>
            </div>

            <ol className="space-y-0" aria-label="Order progress">
              {order.steps.map((step, index) => {
                const isCurrent = index === currentIndex;
                const isLast = index === order.steps.length - 1;
                return (
                  <li key={step.status} className="relative flex gap-3 pb-5 last:pb-0">
                    {!isLast && (
                      <span
                        aria-hidden="true"
                        className={`absolute left-[11px] top-6 h-[calc(100%-1.5rem)] w-0.5 ${
                          order.steps[index + 1].done ? "bg-emerald-500" : "bg-slate-200"
                        }`}
                      />
                    )}
                    {step.done ? (
                      <CheckCircle2
                        className={`relative h-6 w-6 flex-shrink-0 ${isCurrent ? "text-emerald-600" : "text-emerald-500"}`}
                      />
                    ) : (
                      <Circle className="relative h-6 w-6 flex-shrink-0 text-slate-300" />
                    )}
                    <div className="flex flex-1 flex-wrap items-baseline justify-between gap-x-3">
                      <p
                        className={`text-sm ${
                          isCurrent ? "font-semibold text-slate-900" : step.done ? "text-slate-900" : "text-slate-400"
                        }`}
                      >
                        {step.label}
                        {isCurrent && <span className="ml-2 text-xs font-medium text-emerald-700">Current</span>}
                      </p>
                      {step.done && <p className="text-xs text-muted-foreground">{formatDate(step.at)}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-6 text-center sm:flex-row sm:justify-between sm:text-left">
            <p className="text-sm text-slate-700">Questions about your order?</p>
            <WhatsAppSupportLink />
          </CardContent>
        </Card>

        <p className="pb-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Smart Rotamach. All rights reserved.
        </p>
      </div>
    </div>
  );
}
