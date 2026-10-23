import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TransportScope } from "@/types";

// Three simple checkboxes. Checked = "we charge this on top of the unit price":
//   GST            checked -> GST @18% is added extra; unchecked -> GST is already inside the unit price
//   Installation   checked -> price field to type (blank = auto Rs.8,000 per fan); unchecked -> included / not charged
//   Transportation checked -> Company scope (price field); unchecked -> Customer scope (customer arranges)
export const GST_RATE_LABEL = "18%";

export interface GenerateCharges {
  gstExtra: boolean;
  installationOn: boolean;
  installationCharge: string; // blank = auto (Rs.8,000 per fan)
  transportOn: boolean;
  transportationCharge: string; // blank = 0
}

export const emptyGenerateCharges: GenerateCharges = {
  gstExtra: true,
  installationOn: true,
  installationCharge: "",
  transportOn: true,
  transportationCharge: "",
};

// Builds the checkbox state from a saved Lead (or defaults when it has none).
export function chargesFromLead(lead?: {
  installationCharge?: number | null;
  transportationCharge?: number | null;
  customerTransport?: boolean;
  gstIncludedInPrices?: boolean;
  pricesIncludeChargesAndGst?: boolean;
} | null): GenerateCharges {
  if (!lead) return emptyGenerateCharges;
  return {
    gstExtra: !lead.gstIncludedInPrices && !lead.pricesIncludeChargesAndGst,
    // 0 means "installation not charged" (unticked); null/blank means auto.
    installationOn: lead.installationCharge !== 0 && !lead.pricesIncludeChargesAndGst,
    installationCharge: lead.installationCharge ? String(lead.installationCharge) : "",
    transportOn: !lead.customerTransport,
    transportationCharge: lead.transportationCharge ? String(lead.transportationCharge) : "",
  };
}

// Returns an error message, or "" when valid.
export function validateGenerateCharges(c: GenerateCharges): string {
  for (const [label, on, v] of [
    ["Installation", c.installationOn, c.installationCharge],
    ["Transportation", c.transportOn, c.transportationCharge],
  ] as const) {
    if (on && v.trim() && (!Number.isFinite(Number(v)) || Number(v) < 0)) {
      return `${label} charge must be a number of 0 or more.`;
    }
  }
  return "";
}

// Maps the checkboxes to the quotation API payload. Blanks are omitted so the
// backend keeps its defaults (auto installation, zero transportation).
export function generateChargesPayload(c: GenerateCharges) {
  return {
    gstIncludedInPrices: !c.gstExtra,
    // Installation unchecked => 0 => shown as "Included".
    ...(!c.installationOn
      ? { installationCharge: 0 }
      : c.installationCharge.trim()
        ? { installationCharge: Number(c.installationCharge) }
        : {}),
    ...(!c.transportOn
      ? { transportScope: "CUSTOMER_SCOPE" as TransportScope }
      : {
          transportScope: "COMPANY_SCOPE" as TransportScope,
          ...(c.transportationCharge.trim() ? { transportationCharge: Number(c.transportationCharge) } : {}),
        }),
  };
}

interface Props {
  value: GenerateCharges;
  onChange: (next: GenerateCharges) => void;
  idPrefix: string;
}

export default function GenerateChargesFields({ value, onChange, idPrefix }: Props) {
  return (
    <div className="space-y-3 rounded-md border p-3">
      <p className="text-sm font-medium">GST, Installation &amp; Transportation</p>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={value.gstExtra}
          onChange={(e) => onChange({ ...value, gstExtra: e.target.checked })}
        />
        <span>
          GST @ {GST_RATE_LABEL} extra
          <span className="block text-xs text-muted-foreground">
            Untick if the unit price already includes GST.
          </span>
        </span>
      </label>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.installationOn}
            onChange={(e) => onChange({ ...value, installationOn: e.target.checked })}
          />
          Installation charged extra
        </label>
        {value.installationOn && (
          <div className="space-y-1 pl-6">
            <Label htmlFor={`${idPrefix}-install`} className="text-xs">Installation (₹)</Label>
            <Input
              id={`${idPrefix}-install`}
              type="number"
              min={0}
              value={value.installationCharge}
              onChange={(e) => onChange({ ...value, installationCharge: e.target.value })}
              placeholder="Enter amount (blank = ₹8,000 per fan)"
            />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.transportOn}
            onChange={(e) => onChange({ ...value, transportOn: e.target.checked })}
          />
          Transportation by company
          <span className="text-xs text-muted-foreground">(untick = customer arranges)</span>
        </label>
        {value.transportOn && (
          <div className="space-y-1 pl-6">
            <Label htmlFor={`${idPrefix}-transport`} className="text-xs">Transportation (₹)</Label>
            <Input
              id={`${idPrefix}-transport`}
              type="number"
              min={0}
              value={value.transportationCharge}
              onChange={(e) => onChange({ ...value, transportationCharge: e.target.value })}
              placeholder="Enter amount (blank = ₹0)"
            />
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        You can still change these later by editing the quotation.
      </p>
    </div>
  );
}
