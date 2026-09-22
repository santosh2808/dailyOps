import { useEffect, useState } from "react";
import { Select } from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/errors";
import { listLeads } from "@/api/leads";
import type { Lead } from "@/types";

interface LeadSelectProps {
  value: string;
  onChange: (leadId: string) => void;
  id?: string;
}

// Powers "Generate from Lead" on the Quotations list — the same one-click
// Generate Quotation action already on Lead Details, just reachable from a
// second entry point. Mirrors CustomerSelect's fetch pattern exactly. Only
// Qualified leads are listed (generateQuotationFromLead() requires it
// server-side too — see LeadsService.getLeadForQuotationGeneration()), and
// leads with no linked products are filtered out client-side since
// generating from one would just come back as an error.
export default function LeadSelect({ value, onChange, id }: LeadSelectProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadLeads() {
      try {
        const res = await listLeads({ page: 1, limit: 100, status: "QUALIFIED" });
        if (!cancelled) {
          setLeads(res.data.filter((lead) => (lead._count?.products ?? 0) > 0));
        }
      } catch (err) {
        if (!cancelled) {
          const message = getErrorMessage(err, "Could not load the lead list.");
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
        <option value="">Select a qualified lead...</option>
        {leads.map((lead) => (
          <option key={lead.id} value={lead.id}>
            {lead.companyName} — {lead.contactPerson}
          </option>
        ))}
      </Select>
      {loadError && <p className="text-xs text-destructive">{loadError}</p>}
      {!loadError && leads.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No Qualified leads with products are available to quote right now.
        </p>
      )}
    </div>
  );
}
