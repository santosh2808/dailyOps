// QA bug-fix pass, Group B (TC-083/097): shared phone normalization for
// every form that collects an Indian mobile number (Lead, Customer,
// Supplier). Mirrors backend/src/common/phone.util.ts's normalizePhone()
// exactly — kept in sync by hand, same "no cross-file coupling" convention
// already used elsewhere in this codebase (e.g. jeoOptions.ts's hanging
// structure labels). Before this, each form had its own PHONE_REGEX and
// validated the raw typed string, so "+91 98765 43210" (the natural way to
// type a number read off a business card) was rejected outright by every
// one of them instead of being normalized down to "9876543210".
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return null;
}

// The canonical stored shape everywhere in this app is a bare 10-digit
// number — this validates that shape (call normalizePhone() first to get
// there from whatever the user actually typed).
export const PHONE_REGEX = /^\d{10}$/;
