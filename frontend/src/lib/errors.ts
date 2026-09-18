// Shared helper for surfacing the ACTUAL backend error message instead of a
// generic "Something went wrong" string. Before this, most catch blocks
// across the app just showed a hardcoded fallback, so the real reason for a
// failure (a validation message, a 409 conflict explanation, a business-rule
// rejection like "A quotation with status X cannot be sent") was only
// visible by opening DevTools' Network tab. A handful of dialogs already
// did this correctly ad hoc (e.g. SendQuotationDialog.tsx); this centralizes
// that same extraction so every catch block can use it consistently.
//
// NestJS's ValidationPipe sometimes returns `message` as an array of
// per-field validation strings rather than a single string — those are
// joined into one readable line rather than showing "[object Object]" or
// just the first entry.
export function getErrorMessage(err: unknown, fallback: string): string {
  const raw = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.filter((m) => typeof m === "string").join(", ") || fallback;
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw;
  }
  return fallback;
}
