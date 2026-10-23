// Day-based filter helpers. The UI date pickers send plain calendar dates
// ("2026-10-21"); `new Date("2026-10-21")` is midnight UTC at the START of
// that day, so using it as an inclusive upper bound dropped everything created
// on the end date (and made a single-day range match nothing). A plain date
// now means the whole calendar day in India time (IST, UTC+05:30). Full ISO
// timestamps are used exactly as given.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const IST_OFFSET = '+05:30';

export function rangeStart(value: string): Date {
  return DATE_ONLY.test(value) ? new Date(`${value}T00:00:00.000${IST_OFFSET}`) : new Date(value);
}

// Returns the bound and whether it is exclusive (next midnight) or inclusive.
export function rangeEnd(value: string): { date: Date; exclusive: boolean } {
  if (DATE_ONLY.test(value)) {
    const next = new Date(`${value}T00:00:00.000${IST_OFFSET}`);
    next.setUTCDate(next.getUTCDate() + 1);
    return { date: next, exclusive: true };
  }
  return { date: new Date(value), exclusive: false };
}

export function createdAtRange(from?: string, to?: string): { gte?: Date; lt?: Date; lte?: Date } {
  const out: { gte?: Date; lt?: Date; lte?: Date } = {};
  if (from) out.gte = rangeStart(from);
  if (to) {
    const end = rangeEnd(to);
    if (end.exclusive) out.lt = end.date;
    else out.lte = end.date;
  }
  return out;
}
