// Business rule: every document email sent out of DailyOps (Quotation,
// JEO factory notification, Proforma Invoice, Tax Invoice) always CCs these
// three addresses, in addition to whatever CC the sender/DTO supplies (or
// any per-document fallback like FINANCE_TEAM_EMAIL). Kept as one small,
// dependency-free file so every sending service can import it directly —
// same rationale as sales-orders/dispatch-override-approvers.ts.
export const DEFAULT_CC_EMAILS = [
  'admin@smartrotamac.com',
  'santosh.c@smartrotamac.com',
  'amar@smartrotamac.com',
] as const;

const DEFAULT_CC_STRING = DEFAULT_CC_EMAILS.join(',');

// Combines any number of comma-separated (or empty/undefined) CC strings
// into one deduplicated, comma-separated string — case-insensitive dedupe,
// first-seen casing kept. Always folds in DEFAULT_CC_EMAILS regardless of
// what else is passed. Returns undefined only if the result would be empty
// (never happens in practice since DEFAULT_CC_EMAILS is non-empty, but kept
// for symmetry with the MailerSendOptions.cc?: string | null type).
export function mergeCc(...ccGroups: Array<string | null | undefined>): string | undefined {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const group of [DEFAULT_CC_STRING, ...ccGroups]) {
    if (!group) continue;
    for (const raw of group.split(',')) {
      const email = raw.trim();
      if (!email) continue;
      const key = email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(email);
    }
  }
  return result.length > 0 ? result.join(',') : undefined;
}
