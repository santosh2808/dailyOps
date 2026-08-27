// Shared helper for every "pick a date that can't be in the past" field
// app-wide (Lead's Expected Close Date / Next Follow-up, Quotation's Valid
// Until, Sales Order's Delivery Date, Proforma Invoice's Valid Until, ...).
// Returns today's date as a yyyy-mm-dd string in the browser's local
// timezone — the exact format <input type="date"> uses for both its value
// and its `min` attribute, so `min={todayDateInputValue()}` stops the native
// picker from offering any earlier date.
export function todayDateInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// The `min` attribute alone only blocks the calendar picker UI — some
// browsers still allow typing/pasting an earlier date straight into the
// text portion of the field. This is the matching validation check every
// form below runs before submit, so a past date is rejected either way.
export function isPastDateInputValue(value: string): boolean {
  return !!value && value < todayDateInputValue();
}
