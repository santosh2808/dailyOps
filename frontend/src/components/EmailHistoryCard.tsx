import { Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EmailHistoryEntry } from "@/types";

// Shared "Email History" section (requirement #16) — used on Sales Order,
// Proforma Invoice, and Job Execution Order Details pages. Quotation
// Details renders its own inline version alongside the Send Quotation
// action, but the list markup here is identical on purpose.

interface EmailHistoryCardProps {
  loading: boolean;
  entries: EmailHistoryEntry[];
}

export default function EmailHistoryCard({ loading, entries }: EmailHistoryCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Email History</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading email history...</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No emails sent yet.</p>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 rounded-md border px-3 py-2 text-sm">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-orange" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="font-medium text-slate-900">{entry.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(entry.sentAt).toLocaleString()}
                    </p>
                  </div>
                  <p className="text-muted-foreground">
                    To: {entry.recipientEmail}
                    {entry.ccEmails ? ` (cc: ${entry.ccEmails})` : ""}
                  </p>
                  <p
                    className={
                      entry.status === "FAILED"
                        ? "text-xs text-destructive"
                        : entry.status === "SIMULATED"
                          ? "text-xs text-amber-600"
                          : "text-xs text-emerald-600"
                    }
                  >
                    {entry.status}
                    {entry.sentBy ? ` · by ${entry.sentBy}` : ""}
                  </p>
                  {/* BUG FIX: errorMessage was always captured by
                      MailerService on a FAILED send, but was never actually
                      rendered anywhere on this card — a Failed row gave no
                      way to see why. */}
                  {entry.errorMessage && (
                    <p className="mt-0.5 text-xs text-destructive">{entry.errorMessage}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
