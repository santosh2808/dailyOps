// How a JEO number is shown on screen: "JEO 4004", the same as its PDF's
// file name ("JEO 4004.pdf"). A JEO stored as JEO-<year>-<number> (e.g.
// JEO-2026-4004 — the year only keeps numbers unique across years) and an
// older plain state-series number ("4008") both show as "JEO <number>"
// ("JEO 4004-2" for a second JEO on the same Sales Order). The original
// zero-padded JEO-YYYY-NNNNNN numbers already read as a JEO and show as
// stored. Same number rules as backend/src/common/jeo-number.ts.
const STATE_SERIES_JEO = /^JEO-\d{4}-([1-9]\d*(?:-\d+)?)$/;
const PLAIN_STATE_SERIES_JEO = /^[1-9]\d*(?:-\d+)?$/;

export function jeoDisplayNumber(jeoNumber: string): string {
  const number = STATE_SERIES_JEO.exec(jeoNumber)?.[1] ?? (PLAIN_STATE_SERIES_JEO.test(jeoNumber) ? jeoNumber : null);
  return number ? `JEO ${number}` : jeoNumber;
}
