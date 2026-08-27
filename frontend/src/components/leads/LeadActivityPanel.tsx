import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  Factory,
  FileText,
  Pencil,
  PlusCircle,
  Receipt,
  RefreshCw,
  Send,
  ShoppingCart,
  StickyNote,
  UserCog,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { getLeadHistory, getLeadNotes, addLeadNote } from "@/api/leads";
import type { LeadHistoryAction, LeadHistoryEntry, LeadNote } from "@/types";

// Lead Management Phase 1 (requirement #6): Lead Details now has exactly
// four tabs — Overview, Timeline, Notes, Attachments. This component
// renders whichever one of Timeline/Notes is asked for via `view`; the
// previously separate Assignment History / Status History / Email History
// tabs (Sales Automation phase) are consolidated here presentation-only —
// ASSIGNED and STATUS_CHANGED entries already land in this same
// getLeadHistory() feed, so nothing is actually lost. The underlying
// getLeadAssignmentHistory()/getLeadStatusHistory()/getLeadEmailHistory()
// endpoints are untouched and still used elsewhere (e.g. Quotation Details'
// own Email History card).

const ACTION_ICON: Record<LeadHistoryAction, LucideIcon> = {
  CREATED: PlusCircle,
  EDITED: Pencil,
  ASSIGNED: UserCog,
  STATUS_CHANGED: RefreshCw,
  NOTE_ADDED: StickyNote,
  FOLLOWUP_ADDED: RefreshCw,
  QUOTATION_CREATED: FileText,
  CUSTOMER_CONVERTED: CheckCircle2,
  QUOTATION_SENT: Send,
  SALES_ORDER_CREATED: ShoppingCart,
  PROFORMA_INVOICE_GENERATED: Receipt,
  JEO_GENERATED: Factory,
  QUOTATION_ACCEPTED: CheckCircle2,
  QUOTATION_REJECTED: XCircle,
};

const ACTION_LABEL: Record<LeadHistoryAction, string> = {
  CREATED: "Lead Created",
  EDITED: "Edited",
  ASSIGNED: "Assigned",
  STATUS_CHANGED: "Status Changed",
  NOTE_ADDED: "Note Added",
  FOLLOWUP_ADDED: "Follow-up Added",
  QUOTATION_CREATED: "Quotation Generated",
  CUSTOMER_CONVERTED: "Customer Converted",
  QUOTATION_SENT: "Quotation Sent",
  SALES_ORDER_CREATED: "Sales Order Created",
  PROFORMA_INVOICE_GENERATED: "Proforma Invoice Generated",
  JEO_GENERATED: "JEO Generated",
  QUOTATION_ACCEPTED: "Quotation Accepted",
  QUOTATION_REJECTED: "Quotation Rejected",
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

interface LeadActivityPanelProps {
  leadId: string;
  refreshKey: number;
  view: "timeline" | "notes";
}

export default function LeadActivityPanel({ leadId, refreshKey, view }: LeadActivityPanelProps) {
  const [history, setHistory] = useState<LeadHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");

  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesError, setNotesError] = useState("");
  const [newNote, setNewNote] = useState("");
  const [submittingNote, setSubmittingNote] = useState(false);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      setHistory(await getLeadHistory(leadId));
    } catch {
      setHistoryError("Could not load the activity timeline.");
      toast.error("Could not load the activity timeline.");
    } finally {
      setHistoryLoading(false);
    }
  }, [leadId]);

  const fetchNotes = useCallback(async () => {
    setNotesLoading(true);
    setNotesError("");
    try {
      setNotes(await getLeadNotes(leadId));
    } catch {
      setNotesError("Could not load notes.");
      toast.error("Could not load notes.");
    } finally {
      setNotesLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    if (view === "timeline") {
      fetchHistory();
    } else {
      fetchNotes();
    }
  }, [view, fetchHistory, fetchNotes, refreshKey]);

  async function handleAddNote(e: FormEvent) {
    e.preventDefault();
    const note = newNote.trim();
    if (!note) return;
    setSubmittingNote(true);
    try {
      await addLeadNote(leadId, note);
      setNewNote("");
      toast.success("Note added.");
      await fetchNotes();
    } catch {
      const message = "Could not save this note. Please try again.";
      setNotesError(message);
      toast.error(message);
    } finally {
      setSubmittingNote(false);
    }
  }

  if (view === "notes") {
    return (
      <div className="space-y-4">
        <form onSubmit={handleAddNote} className="space-y-2">
          <Textarea
            placeholder="Add a note about this lead..."
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={submittingNote || !newNote.trim()}>
              {submittingNote && <Spinner className="mr-2 h-4 w-4" />}
              {submittingNote ? "Saving..." : "Add Note"}
            </Button>
          </div>
        </form>

        {notesLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Loading notes...
          </p>
        ) : notesError ? (
          <p className="text-sm text-destructive">{notesError}</p>
        ) : notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes yet. Notes you add here also show up in the Timeline.</p>
        ) : (
          <ul className="space-y-3">
            {notes.map((note) => (
              <li key={note.id} className="rounded-md border px-3 py-2">
                <p className="whitespace-pre-wrap text-sm text-slate-900">{note.note}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {note.createdBy || "Unknown"} — {formatDateTime(note.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return historyLoading ? (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Spinner /> Loading timeline...
    </p>
  ) : historyError ? (
    <p className="text-sm text-destructive">{historyError}</p>
  ) : history.length === 0 ? (
    <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
  ) : (
    <ol className="space-y-4">
      {history.map((entry) => {
        const Icon = ACTION_ICON[entry.action] ?? RefreshCw;
        return (
          <li key={entry.id} className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange/10 text-orange">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1 border-b pb-3 last:border-b-0 last:pb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-sm font-medium text-slate-900">{ACTION_LABEL[entry.action] ?? entry.action}</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</p>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">{entry.description}</p>
              {entry.performedBy && <p className="mt-0.5 text-xs text-muted-foreground">by {entry.performedBy}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
