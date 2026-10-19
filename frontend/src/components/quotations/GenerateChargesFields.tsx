import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TransportScope } from "@/types";

export interface GenerateCharges {
  installationCharge: string; // blank = auto (₹8,000 per fan)
  transportationCharge: string; // blank = 0
  customerTransport: boolean;
  // Unit prices already include GST, installation and transportation.
  pricesInclude?: boolean;
}

export const emptyGenerateCharges: GenerateCharges = {
  installationCharge: "",
  transportationCharge: "",
  customerTransport: false,
  pricesInclude: false,
};

// Returns an error message, or "" when valid.
export function validateGenerateCharges(c: GenerateCharges): string {
  if (c.pricesInclude) return "";
  for (const [label, v] of [
    ["Installation", c.installationCharge],
    ["Transportation", c.transportationCharge],
  ] as const) {
    if (v.trim() && (!Number.isFinite(Number(v)) || Number(v) < 0)) {
      return `${label} charge must be a number of 0 or more.`;
    }
  }
  return "";
}

// Maps the form to the quotation API payload; blanks are omitted so the
// backend keeps its defaults (auto installation, zero transportation).
export function generateChargesPayload(c: GenerateCharges) {
  if (c.pricesInclude) return { pricesIncludeChargesAndGst: true };
  return {
    ...(c.installationCharge.trim() ? { installationCharge: Number(c.installationCharge) } : {}),
    ...(c.customerTransport
      ? { transportScope: "CUSTOMER_SCOPE" as TransportScope }
      : c.transportationCharge.trim()
        ? { transportationCharge: Number(c.transportationCharge) }
        : {}),
  };
}

interface Props {
  value: GenerateCharges;
  onChange: (next: GenerateCharges) => void;
  idPrefix: string;
}

// Lets staff set Installation / Transportation at the moment they generate a
// quotation, instead of having to open Edit afterwards to check them.
export default function GenerateChargesFields({ value, onChange, idPrefix }: Props) {
  return (
    <div className="space-y-3 rounded-md border p-3">
      <p className="text-sm font-medium">GST, Installation &amp; Transportation</p>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={!!value.pricesInclude}
          onChange={(e) => onChange({ ...value, pricesInclude: e.target.checked })}
        />
        <span>
          Unit price already includes GST, installation and transportation
          <span className="block text-xs text-muted-foreground">
            Tick this when the price you entered is all-inclusive, so nothing extra is added on top.
          </span>
        </span>
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-install`}>Installation (₹)</Label>
          <Input
            id={`${idPrefix}-install`}
            type="number"
            min={0}
            value={value.pricesInclude ? "" : value.installationCharge}
            disabled={!!value.pricesInclude}
            onChange={(e) => onChange({ ...value, installationCharge: e.target.value })}
            placeholder="Auto: ₹8,000 per fan"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-transport`}>Transportation (₹)</Label>
          <Input
            id={`${idPrefix}-transport`}
            type="number"
            min={0}
            value={value.customerTransport ? "" : value.transportationCharge}
            disabled={value.customerTransport || !!value.pricesInclude}
            onChange={(e) => onChange({ ...value, transportationCharge: e.target.value })}
            placeholder={value.customerTransport ? "By customer" : "Leave blank for ₹0"}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.customerTransport}
          disabled={!!value.pricesInclude}
          onChange={(e) => onChange({ ...value, customerTransport: e.target.checked })}
        />
        Transportation arranged by customer
      </label>
      <p className="text-xs text-muted-foreground">
        Installation is charged per fan unless prices are all-inclusive. You can still change these later by editing the quotation.
      </p>
    </div>
  );
}
