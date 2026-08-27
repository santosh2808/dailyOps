// Free address helpers for the Billing/Shipping Address fields — no paid
// API key, no billing account. Two independent lookups:
//
// 1. PIN code -> City/District/State via India Post's public Pincode API
//    (api.postalpincode.in). Government-run, free, no key, no rate limit
//    published — safe for normal form-filling volume.
// 2. Free-text address search-as-you-type via OpenStreetMap's Nominatim
//    (nominatim.openstreetmap.org). Free and keyless, but its usage policy
//    caps clients at ~1 request/second and requires attribution wherever
//    results are shown — see the "Powered by OpenStreetMap" caption next to
//    every place this is used. Coverage/precision for Indian addresses is
//    noticeably rougher than a paid provider (Google Places etc.), so this
//    is a convenience/starting-point, not a guarantee of a perfect address.

export interface PincodeResult {
  city: string;
  district: string;
  state: string;
  country: string;
  pincode: string;
}

export async function lookupPincode(pincode: string): Promise<PincodeResult | null> {
  const res = await fetch(`https://api.postalpincode.in/pincode/${encodeURIComponent(pincode)}`);
  if (!res.ok) throw new Error(`Pincode lookup failed (${res.status})`);
  const data = await res.json();
  const entry = Array.isArray(data) ? data[0] : null;
  const office = entry?.PostOffice?.[0];
  if (!entry || entry.Status !== "Success" || !office) {
    return null;
  }
  return {
    city: office.Name ?? "",
    district: office.District ?? "",
    state: office.State ?? "",
    country: office.Country ?? "India",
    pincode: office.Pincode ?? pincode,
  };
}

export interface AddressSuggestion {
  id: string;
  displayName: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
}

// Minimum characters before we search at all — avoids firing a request per
// keystroke on very short, low-value queries.
export const ADDRESS_SEARCH_MIN_LENGTH = 3;

export async function searchAddress(
  query: string,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "in");
  url.searchParams.set("limit", "5");
  url.searchParams.set("q", query);

  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`Address search failed (${res.status})`);
  const data = await res.json();
  if (!Array.isArray(data)) return [];

  return data.map((entry: any) => {
    const addr = entry.address ?? {};
    const line1 = [addr.house_number, addr.road ?? addr.neighbourhood ?? addr.suburb]
      .filter(Boolean)
      .join(" ");
    const city = addr.city ?? addr.town ?? addr.village ?? addr.suburb ?? "";
    return {
      id: String(entry.place_id),
      displayName: entry.display_name,
      line1: line1 || entry.display_name.split(",")[0],
      city,
      state: addr.state ?? "",
      pincode: addr.postcode ?? "",
    };
  });
}
