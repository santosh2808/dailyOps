import { useCallback, useEffect, useState } from "react";
import { Bot, PhoneCall } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import AiStatusBadge from "./AiStatusBadge";
import AiQualificationBadge from "./AiQualificationBadge";
import { LANGUAGE_SOURCE_LABELS, preferredLanguageLabel } from "./aiOptions";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/errors";
import { getLeadAiCallHistory } from "@/api/leads";
import type { Lead, LeadAiCallLog } from "@/types";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm text-slate-900">{value || "—"}</p>
    </div>
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString();
}

function formatDuration(seconds?: number | null) {
  if (seconds == null) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

// D.O.T. AI Lead Assistant Phase 1 — "D.O.T. AI Follow-up" section + Call
// History list on Lead Details (Step 8/9 of the feature spec). Read-only:
// no button here places a call or triggers anything — Phase 1 has no
// telephony integration. Fetches its own call-log list independently of
// the parent's `lead` fetch (same pattern as LeadActivityPanel), keyed off
// `refreshKey` so a future manual "Log Test Call" action elsewhere can
// force a re-fetch.
interface LeadAiFollowUpCardProps {
  lead: Lead;
  refreshKey?: number;
}

export default function LeadAiFollowUpCard({ lead, refreshKey }: LeadAiFollowUpCardProps) {
  const [callLog, setCallLog] = useState<LeadAiCallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchCallLog = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCallLog(await getLeadAiCallHistory(lead.id));
    } catch (err) {
      const message = getErrorMessage(err, "Could not load D.O.T. call history.");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [lead.id]);

  useEffect(() => {
    fetchCallLog();
  }, [fetchCallLog, refreshKey]);

  const hasActivity = lead.aiStatus !== "NOT_STARTED" || lead.aiCallAttempts > 0;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-orange" />
            D.O.T. AI Follow-up
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!hasActivity ? (
            <p className="text-sm text-muted-foreground">
              D.O.T. hasn't contacted this lead yet.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field label="Status" value={<AiStatusBadge status={lead.aiStatus} />} />
              <Field
                label="Interest"
                value={lead.aiQualification ? <AiQualificationBadge qualification={lead.aiQualification} /> : null}
              />
              <Field
                label="Language"
                value={
                  <span>
                    {preferredLanguageLabel(lead.preferredLanguage)}
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({LANGUAGE_SOURCE_LABELS[lead.languageSource]})
                    </span>
                  </span>
                }
              />
              <Field label="Attempts" value={lead.aiCallAttempts} />
              <Field label="Last Call" value={formatDateTime(lead.lastAiCallAt)} />
              <Field label="Next Call" value={formatDateTime(lead.nextAiCallAt)} />
              <Field
                label="Site Visit"
                value={lead.aiSiteVisitRequested ? <Badge variant="warning">Requested</Badge> : "Not requested"}
              />
              <Field
                label="Callback"
                value={
                  lead.aiCallbackRequested ? (
                    <Badge variant="warning">
                      Requested{formatDateTime(lead.aiCallbackAt) ? ` — ${formatDateTime(lead.aiCallbackAt)}` : ""}
                    </Badge>
                  ) : (
                    "Not requested"
                  )
                }
              />
              {lead.aiSummary && (
                <div className="col-span-2 sm:col-span-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">AI Summary</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-900">{lead.aiSummary}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {(loading || error || callLog.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PhoneCall className="h-4 w-4 text-orange" />
              D.O.T. Call History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner /> Loading call history...
              </p>
            ) : error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : (
              <ol className="space-y-4">
                {callLog.map((call) => (
                  <li key={call.id} className="border-b pb-3 last:border-b-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900">
                        {formatDateTime(call.startedAt) || formatDateTime(call.createdAt)}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <AiStatusBadge status={call.status} />
                        {call.qualification && <AiQualificationBadge qualification={call.qualification} />}
                      </div>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      {call.durationSeconds != null && <span>Duration: {formatDuration(call.durationSeconds)}</span>}
                      {call.language && <span>Language: {preferredLanguageLabel(call.language)}</span>}
                    </div>
                    {call.summary && <p className="mt-1 text-sm text-muted-foreground">{call.summary}</p>}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      )}

      {/* Reserved for Phase 2 — no telephony provider is integrated yet, so
          there is nothing to view/listen to. Intentionally not rendering
          disabled "View Transcript"/"Listen to Call" buttons here (see
          feature spec Step 9: "don't show broken buttons"). */}
    </>
  );
}
