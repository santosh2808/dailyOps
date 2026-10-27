import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MobileRecordList, ResponsiveRecords } from "@/components/shared/MobileRecordList";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/errors";
import { getLeadAccessSummary } from "@/api/leads";
import { listAuditLog } from "@/api/audit-log";
import type { AuditLogEntry, LeadAccessSummaryRow } from "@/types";

const ACTIONS = ["", "Viewed", "Exported", "Copied", "Printed"];
const PAGE_SIZE = 20;

// Who viewed, exported, copied or printed lead data. Copy/print are reported by
// the browser; screenshots and photos of the screen can't be detected.
export default function LeadAccessAudit() {
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState<LeadAccessSummaryRow[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(true);

  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const [events, setEvents] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingEvents, setLoadingEvents] = useState(true);

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const res = await getLeadAccessSummary(days);
      setSummary(res.users);
      setTruncated(res.truncated);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to load the access summary."));
    } finally {
      setLoadingSummary(false);
    }
  }, [days]);

  const loadEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const res = await listAuditLog({
        module: "LeadAccess",
        action: action || undefined,
        page,
        limit: PAGE_SIZE,
        dateFrom: new Date(Date.now() - days * 86400000).toISOString(),
      });
      setEvents(res.data);
      setTotal(res.total);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to load access events."));
    } finally {
      setLoadingEvents(false);
    }
  }, [action, page, days]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);
  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="app-shell bg-app-grid">
      <Sidebar />
      <div className="app-shell-content">
        <Topbar title="Lead Access Audit" />
        <main className="app-shell-main space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-sm text-muted-foreground">
              Who opened, exported, copied or printed lead data. Copy and print are recorded from the browser; a
              screenshot or a photo of the screen can't be detected.
            </p>
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={days}
              onChange={(e) => {
                setDays(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </div>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-900">By user</h2>
            {truncated && (
              <p className="mb-2 text-xs text-amber-700">
                Very high activity — totals cover only the most recent events in this period.
              </p>
            )}
            <ResponsiveRecords
              table={
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead className="text-right">Leads opened</TableHead>
                      <TableHead className="text-right">Exports</TableHead>
                      <TableHead className="text-right">Copies</TableHead>
                      <TableHead className="text-right">Prints</TableHead>
                      <TableHead>Last activity</TableHead>
                      <TableHead>Worth a look</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingSummary ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                          <Spinner /> Loading...
                        </TableCell>
                      </TableRow>
                    ) : summary.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                          No lead access recorded in this period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      summary.map((u) => (
                        <TableRow key={u.actorName}>
                          <TableCell className="font-medium">{u.actorName}</TableCell>
                          <TableCell className="text-right">
                            {u.distinctLeadsViewed}
                            <span className="text-xs text-muted-foreground"> ({u.viewed} views)</span>
                          </TableCell>
                          <TableCell className="text-right">
                            {u.exported}
                            {u.leadsExported > 0 && (
                              <span className="text-xs text-muted-foreground"> ({u.leadsExported} rows)</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{u.copied}</TableCell>
                          <TableCell className="text-right">{u.printed}</TableCell>
                          <TableCell>{new Date(u.lastActivity).toLocaleString()}</TableCell>
                          <TableCell>
                            {u.flags.length === 0 ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : (
                              <div className="flex flex-col gap-0.5 text-xs text-amber-700">
                                {u.flags.map((f) => (
                                  <span key={f} className="inline-flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" />
                                    {f}
                                  </span>
                                ))}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              }
              mobile={
                <MobileRecordList
                  rows={summary}
                  getKey={(u) => u.actorName}
                  title={(u) => u.actorName}
                  meta={(u) => `${u.distinctLeadsViewed} leads opened · ${new Date(u.lastActivity).toLocaleString()}`}
                  fields={[
                    {
                      label: "Leads opened",
                      render: (u) => (
                        <>
                          {u.distinctLeadsViewed}
                          <span className="text-xs text-muted-foreground"> ({u.viewed} views)</span>
                        </>
                      ),
                    },
                    {
                      label: "Exports",
                      render: (u) => (
                        <>
                          {u.exported}
                          {u.leadsExported > 0 && <span className="text-xs text-muted-foreground"> ({u.leadsExported} rows)</span>}
                        </>
                      ),
                    },
                    { label: "Copies", render: (u) => u.copied },
                    { label: "Prints", render: (u) => u.printed },
                    { label: "Last activity", render: (u) => new Date(u.lastActivity).toLocaleString() },
                    {
                      label: "Worth a look",
                      render: (u) =>
                        u.flags.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-col gap-0.5 text-xs text-amber-700">
                            {u.flags.map((f) => (
                              <span key={f} className="inline-flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                {f}
                              </span>
                            ))}
                          </div>
                        ),
                    },
                  ]}
                  loading={loadingSummary}
                  loadingText="Loading..."
                  emptyText="No lead access recorded in this period."
                />
              }
            />
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Activity log</h2>
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                value={action}
                onChange={(e) => {
                  setAction(e.target.value);
                  setPage(1);
                }}
              >
                {ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a || "All actions"}
                  </option>
                ))}
              </select>
            </div>
            <ResponsiveRecords
              table={
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Lead</TableHead>
                      <TableHead>Detail</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingEvents ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                          <Spinner /> Loading...
                        </TableCell>
                      </TableRow>
                    ) : events.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                          No events.
                        </TableCell>
                      </TableRow>
                    ) : (
                      events.map((e) => {
                        const leadNumber = (e.newValue as { leadNumber?: string } | null)?.leadNumber;
                        return (
                          <TableRow key={e.id}>
                            <TableCell>{new Date(e.createdAt).toLocaleString()}</TableCell>
                            <TableCell>{e.actorName ?? "—"}</TableCell>
                            <TableCell>{e.action}</TableCell>
                            <TableCell>
                              {e.recordId ? (
                                <Link to={`/leads/${e.recordId}`} className="text-primary hover:underline">
                                  {leadNumber ?? "Open lead"}
                                </Link>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{e.remarks ?? ""}</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              }
              mobile={
                <MobileRecordList
                  rows={events}
                  getKey={(e) => e.id}
                  title={(e) => e.action}
                  subtitle={(e) => e.actorName ?? "—"}
                  meta={(e) => new Date(e.createdAt).toLocaleString()}
                  fields={[
                    { label: "When", render: (e) => new Date(e.createdAt).toLocaleString() },
                    { label: "User", render: (e) => e.actorName ?? "—" },
                    { label: "Action", render: (e) => e.action },
                    {
                      label: "Lead",
                      render: (e) => {
                        const leadNumber = (e.newValue as { leadNumber?: string } | null)?.leadNumber;
                        return e.recordId ? (
                          <Link to={`/leads/${e.recordId}`} className="text-primary hover:underline">
                            {leadNumber ?? "Open lead"}
                          </Link>
                        ) : (
                          "—"
                        );
                      },
                    },
                    { label: "Detail", render: (e) => e.remarks ?? "" },
                  ]}
                  loading={loadingEvents}
                  loadingText="Loading..."
                  emptyText="No events."
                />
              }
            />
            <div className="mt-3 flex items-center justify-end gap-2 text-sm">
              <span className="text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
