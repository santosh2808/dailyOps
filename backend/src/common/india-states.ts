// Additive: Dashboard Redesign v2 — India Sales Map / Customer.state.
// The 28 states + 8 union territories of India, used both to validate
// Customer.state on create/update and to drive the frontend map's
// coloring (frontend/src/lib/indiaStates.ts mirrors this list exactly —
// if you add/rename an entry here, update that file too).
//
// "Jammu & Kashmir" and "Andaman & Nicobar" match the india-map-react
// package's TopoJSON ST_NM spelling exactly — see
// frontend/src/components/dashboard/IndiaSalesMap.tsx.
export const INDIA_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman & Nicobar',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu & Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
] as const;

export type IndiaState = (typeof INDIA_STATES)[number];
