// Additive: Dashboard Redesign v2 — India Sales Map. Mirrors
// backend/src/common/india-states.ts exactly (28 states + 8 union
// territories) — keep both lists in sync if either changes.
//
// "Jammu & Kashmir" and "Andaman & Nicobar" (not "...and...") deliberately
// match the ST_NM property spelling in the india-map-react package's
// bundled TopoJSON (see components/dashboard/IndiaSalesMap.tsx) so a
// Customer.state value can be used to key straight into the map's
// stateData prop with no translation table.
export const INDIA_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman & Nicobar",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu & Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
] as const;

export type IndiaState = (typeof INDIA_STATES)[number];
