import { useEffect, useState } from "react";
import { Select } from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/errors";
import { listLeads } from "@/api/leads";
import type { Lead } from "@/types";

interface PreviousLeadSelectProps {
  value: string;
  onChange: (leadId: string) => void;
  id?: string;
}

// Lead re-engagement (create-mode only — see LeadForm.tsx). Mirrors
// quotations/LeadSelect.tsx's fetch-once-and-filter pattern exactly, just
// pointed at Lost leads instead of Qualified ones — the backend only
// accepts a Lost lead as a "Previous Lead" link anyway (see
// LeadsService.create()'s validation), so there's no point listing anything
// else here.
export default function PreviousLeadSelect({ value, onChange, id }: PreviousLeadSelectProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadLeads() {
      try {
        const res = await listLeads({ page: 1, limit: 100, status: "LOST" });
        if (!cancelled) {
          setLeads(res.data);
        }
      } catch (err) {
        if (!cancelled) {
          const message = getErrorMessage(err, "Could not load the Lost lead list.");
          setLoadError(message);
          toast.error(message);
        }
      }
    }
    loadLeads();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-1">
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Not a re-engagement — this is a new opportunity</option>
        {leads.map((lead) => (
          <option key={lead.id} value={lead.id}>
            {lead.leadNumber} — {lead.companyName || lead.contactPerson}
          </option>
        ))}
      </Select>
      {loadError && <p className="text-xs text-destructive">{loadError}</p>}
      {!loadError && leads.length === 0 && (
        <p className="text-xs text-muted-foreground">No Lost leads on file to link as a re-engagement.</p>
      )}
    </div>
  );
}
