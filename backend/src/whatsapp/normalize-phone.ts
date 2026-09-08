// Additive: WhatsApp Share (Interakt integration). Every phone number
// stored in this app (Customer.phone / Lead.phone) is a bare 10-digit
// Indian mobile number with no country code — see PHONE_REGEX =
// /^\d{10}$/ in backend/src/leads/dto/create-lead.dto.ts, enforced the
// same way on Customer. Interakt's Send Template API wants the country
// code and number as two separate fields (countryCode: "+91", phoneNumber:
// "9876543210", no leading zero) — this splits/normalizes accordingly,
// tolerating a few already-prefixed shapes rather than only ever accepting
// the canonical 10-digit form.
export interface InteraktPhoneParts {
  countryCode: string;
  phoneNumber: string;
}

export function toInteraktPhoneParts(phone: string | null | undefined): InteraktPhoneParts | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return { countryCode: '+91', phoneNumber: digits };
  if (digits.length === 12 && digits.startsWith('91')) return { countryCode: '+91', phoneNumber: digits.slice(2) };
  if (digits.length === 11 && digits.startsWith('0')) return { countryCode: '+91', phoneNumber: digits.slice(1) };
  return null;
}
