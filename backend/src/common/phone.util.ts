// QA bug-fix pass, Group B (TC-083/097): every phone number this app
// stores (Lead.phone/alternatePhone, Customer.phone) is meant to be a bare
// 10-digit Indian mobile number — see whatsapp/normalize-phone.ts's own
// comment, which documents the same assumption for a different purpose
// (splitting into Interakt's countryCode/phoneNumber shape). Until this
// fix, every DTO validated the *raw* typed string against that bare-digit
// rule, so a staff member (or a website visitor, via the public lead-intake
// form) entering the number the way they'd naturally read it off a card —
// "+91 98765 43210", "+91-9876543210", "091 9876543210" — was rejected
// outright, or (on the unvalidated website-intake path) stored verbatim
// with the punctuation baked in, breaking that lead's phone field for every
// later edit/assign attempt since those DO validate. This normalizes any of
// those shapes down to the canonical bare 10 digits before validation/
// storage; deliberately duck-typed with no dependency on the caller so it
// can be reused from a DTO's @Transform, a raw Prisma-write code path (like
// LeadsService.createFromWebFormIntake()), or the frontend's own copy of
// this same logic (frontend/src/lib/phone.ts — kept in sync by hand, same
// "no cross-file coupling" convention already used elsewhere in this repo).
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return null;
}

// Used inside a DTO's @Transform: normalizes when possible, but falls back
// to returning the original (untouched) value when it doesn't match any
// known shape — letting the DTO's own @Matches decorator reject it with its
// existing, specific error message rather than this utility silently
// swallowing a genuinely invalid value into `undefined`.
export function normalizePhoneForValidation(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return normalizePhone(value) ?? value;
}
