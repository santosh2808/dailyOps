// Build-time feature flags. Vite inlines import.meta.env.* at build time,
// so a flag that's off for a build is a constant `false` in the bundle and
// its experimental UI is never rendered. Neither CI workflow (deploy.yml /
// test-deploy.yml) sets any of these, so TEST and production builds always
// get the default behavior.

// EXPERIMENT (branch experiment/mobile-accordion-view): below md, list
// pages render their records as expandable cards (MobileRecordList)
// instead of the horizontally scrolling table. Desktop/tablet always keep
// the table.
//   npm run dev                               → cards ON (local dev default)
//   VITE_MOBILE_ACCORDION=false npm run dev   → cards OFF (compare with tables)
//   npm run build (CI, TEST, production)      → cards OFF unless
//                                               VITE_MOBILE_ACCORDION=true
const accordionEnv = import.meta.env.VITE_MOBILE_ACCORDION;
export const MOBILE_ACCORDION =
  accordionEnv === "true" || (import.meta.env.DEV && accordionEnv !== "false");
