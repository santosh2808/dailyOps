// JEO numbers as people see them. A JEO is stored as JEO-<year>-<number>
// (e.g. JEO-2026-4004: Telangana's series 4000 + SO-2026-000004), with the
// year only there to keep numbers unique once Sales Order numbering
// restarts each January — in the PDF heading and emails it is just "4004"
// ("4004-2" for a second JEO on the same Sales Order); the file name is
// "JEO 4004.pdf", and screens show "JEO 4004" (frontend/src/lib/jeoNumber.ts,
// same number rules). Older numbers are shown as they always were: the
// original JEO-YYYY-NNNNNN (zero-padded, so never matched below) and the
// plain state-series numbers ("4008").
const STATE_SERIES_JEO = /^JEO-\d{4}-([1-9]\d*(?:-\d+)?)$/;

export function jeoDisplayNumber(jeoNumber: string): string {
  return STATE_SERIES_JEO.exec(jeoNumber)?.[1] ?? jeoNumber;
}

// "JEO <display number>.pdf" (e.g. "JEO 4004.pdf", as the factory's own
// files are named), safe as a file name and inside a quoted
// Content-Disposition filename. Old JEO-YYYY-NNNNNN numbers already start
// with "JEO", so they aren't prefixed twice.
export function jeoPdfFilename(jeoNumber: string): string {
  const shown = jeoDisplayNumber(jeoNumber).replace(/[^A-Za-z0-9._-]/g, '_');
  return `${/^JEO/i.test(shown) ? shown : `JEO ${shown}`}.pdf`;
}
