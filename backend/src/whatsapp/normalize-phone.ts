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

// AiSensy integration — AiSensy takes the destination as one string with
// the country code ("+919876543210"). Stricter than the Interakt helper
// above: it also requires an Indian mobile prefix (6–9), so a landline or
// a mistyped number is rejected here instead of being charged as a failed
// send by AiSensy.
export function toAisensyDestination(phone: string | null | undefined): string | null {
  const parts = toInteraktPhoneParts(phone);
  if (!parts || !/^[6-9]\d{9}$/.test(parts.phoneNumber)) return null;
  return `${parts.countryCode}${parts.phoneNumber}`;
}

// For logs only: "+91******3210".
export function maskPhone(destination: string): string {
  return destination.length > 4 ? `${destination.slice(0, 3)}${'*'.repeat(Math.max(destination.length - 7, 0))}${destination.slice(-4)}` : '****';
}
