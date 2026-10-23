import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, X } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/errors";
import { decideLeadReassignment, listLeadReassignmentRequests } from "@/api/leads";
import type { LeadReassignmentRequest, LeadReassignmentStatus } from "@/types";

const TABS: { key: LeadReassignmentStatus; label: string }[] = [
  { key: "PENDING", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
];

// Sales Executives can't reassign a lead on their own — their request lands
// here for a Sales Manager / Administrator (Lead.Approve) to approve or reject.
export default function LeadReassignments() {
  const [status, setStatus] = useState<LeadReassignmentStatus>("PENDING");
  const [rows, setRows] = useState<LeadReassignmentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listLeadReassignmentRequests(status));
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to load reassignment requests."));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(row: LeadReassignmentRequest, approve: boolean) {
    setBusyId(row.id);
    try {
      await decideLeadReassignment(row.id, approve, notes[row.id]?.trim() || undefined);
      toast.success(
        approve
          ? `${row.lead.leadNumber} reassigned to ${row.toUserName ?? "Unassigned"}.`
          : `Request for ${row.lead.leadNumber} rejected.`,
      );
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not record the decision."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex min-h-dvh bg-app-grid pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Topbar title="Lead Reassignment Requests" />
        <main className="flex-1 p-6">
          <p className="mb-4 text-sm text-muted-foreground">
            A Sales Executive's request to move a lead to someone else. The lead stays with its current owner
            until you approve.
          </p>

          <div className="mb-4 flex gap-2">
            {TABS.map((t) => (
              <Button
                key={t.key}
                size="sm"
                variant={status === t.key ? "default" : "outline"}
                onClick={() => setStatus(t.key)}
              >
                {t.label}
              </Button>
            ))}
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Requested by</TableHead>
                <TableHead>Requested</TableHead>
                {status === "PENDING" ? (
                  <TableHead className="text-right">Decision</TableHead>
                ) : (
                  <TableHead>Decision</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    <Spinner /> Loading...
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No {status.toLowerCase()} requests.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link to={`/leads/${r.lead.id}`} className="font-medium text-primary hover:underline">
                        {r.lead.leadNumber}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {r.lead.companyName || r.lead.contactPerson}
                        {r.lead.state ? ` · ${r.lead.state}` : ""}
                      </div>
                    </TableCell>
                    <TableCell>{r.fromUserName ?? "Unassigned"}</TableCell>
                    <TableCell className="font-medium">{r.toUserName ?? "Unassigned"}</TableCell>
                    <TableCell>{r.requestedBy ?? "—"}</TableCell>
                    <TableCell>{new Date(r.createdAt).toLocaleString()}</TableCell>
                    <TableCell>
                      {status === "PENDING" ? (
                        <div className="flex items-center justify-end gap-2">
                          <input
                            className="h-8 w-40 rounded-md border border-input bg-background px-2 text-xs"
                            placeholder="Note (optional)"
                            value={notes[r.id] ?? ""}
                            onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                          />
                          <Button size="sm" disabled={busyId === r.id} onClick={() => decide(r, true)}>
                            <Check className="mr-1 h-4 w-4" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === r.id}
                            onClick={() => decide(r, false)}
                          >
                            <X className="mr-1 h-4 w-4" />
                            Reject
                          </Button>
                        </div>
                      ) : (
                        <div className="text-xs">
                          {r.decidedBy ?? "—"}
                          {r.decidedAt ? ` · ${new Date(r.decidedAt).toLocaleDateString()}` : ""}
                          {r.decisionNote ? <div className="text-muted-foreground">{r.decisionNote}</div> : null}
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
