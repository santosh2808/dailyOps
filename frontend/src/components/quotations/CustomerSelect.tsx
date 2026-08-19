import { useEffect, useState } from "react";
import { Select } from "@/components/ui/select";
import { listCustomers } from "@/api/customers";
import type { Customer } from "@/types";

interface CustomerSelectProps {
  value: string;
  onChange: (customerId: string) => void;
  id?: string;
}

// Reused by the Create/Edit Quotation form. Mirrors the product-catalog
// fetch pattern in LeadProductsSelector: pull a reasonably large page of
// active customers once, since there's no dedicated "list all" endpoint.
export default function CustomerSelect({ value, onChange, id }: CustomerSelectProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadCustomers() {
      try {
        const res = await listCustomers({ page: 1, limit: 100 });
        if (!cancelled) setCustomers(res.data);
      } catch {
        if (!cancelled) setLoadError("Could not load the customer list.");
      }
    }
    loadCustomers();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-1">
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select a customer...</option>
        {customers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.companyName} — {c.contactPerson}
          </option>
        ))}
      </Select>
      {loadError && <p className="text-xs text-destructive">{loadError}</p>}
    </div>
  );
}
