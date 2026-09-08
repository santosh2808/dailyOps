// Additive: WhatsApp Share — shared helper for building "click-to-chat"
// (wa.me) links, used by the Quotation / Proforma Invoice / Tax Invoice /
// JEO Details pages. This is deliberately NOT the WhatsApp Business API:
// no message is sent automatically. wa.me just opens WhatsApp (web or the
// installed app, whichever the browser resolves it to) with the
// recipient's chat already open and the message pre-filled — the user
// still has to tap Send themselves, same as if they'd typed it in by hand.
// No account, approval, or per-message cost is involved.

// Every phone number stored in this app (Customer.phone / Lead.phone) is a
// bare 10-digit Indian mobile number with no country code — see
// PHONE_REGEX = /^\d{10}$/ in backend/src/leads/dto/create-lead.dto.ts,
// enforced the same way on Customer. wa.me requires the full number
// (country code + number, digits only, no leading +), so this always
// prepends "91". Also tolerates a few already-prefixed shapes in case a
// number was entered with a leading 0 or the country code, rather than
// silently building a broken link.
export function toWhatsAppDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return null;
}

// Returns null (rather than a malformed link) when the phone number isn't
// a recognizable Indian mobile number — callers should hide/disable the
// WhatsApp button in that case instead of opening a broken chat.
export function buildWhatsAppShareUrl(phone: string | null | undefined, message: string): string | null {
  const digits = toWhatsAppDigits(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

// Opens the share link in a new tab; returns false (doing nothing) if the
// phone number couldn't be normalized, so callers can show a toast instead.
export function openWhatsAppShare(phone: string | null | undefined, message: string): boolean {
  const url = buildWhatsAppShareUrl(phone, message);
  if (!url) return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}
