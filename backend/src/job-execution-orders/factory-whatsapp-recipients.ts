// JEO factory WhatsApp — who at the factory gets a WhatsApp when a JEO is
// generated. Env-configured like FACTORY_NOTIFICATION_EMAIL (there's no
// Production distribution list modelled yet), as comma-separated
// "Name:number" entries, e.g. "Krishna:9876543210,Ravi:9123456780". A bare
// number is accepted too. WhatsApp groups can't be messaged through the
// API, so each person gets their own message.
//
// Capped so a pasted list can't fan one JEO out to dozens of paid
// messages; numbers themselves are validated by WhatsAppService.
import { toAisensyDestination } from '../whatsapp/normalize-phone';

export const MAX_FACTORY_WHATSAPP_RECIPIENTS = 10;

export interface FactoryWhatsAppRecipient {
  name: string;
  phone: string;
}

export function factoryWhatsAppRecipients(raw = process.env.FACTORY_WHATSAPP_RECIPIENTS): {
  recipients: FactoryWhatsAppRecipient[];
  dropped: number;
} {
  const seen = new Set<string>();
  const all: FactoryWhatsAppRecipient[] = [];
  for (const entry of (raw ?? '').split(',')) {
    const sep = entry.indexOf(':');
    const name = sep === -1 ? '' : entry.slice(0, sep).trim();
    const phone = (sep === -1 ? entry : entry.slice(sep + 1)).trim();
    // Deduplicated on the normalised number, so "98765 43210" and
    // "+919876543210" are one person.
    const key = toAisensyDestination(phone) ?? phone;
    if (!phone || seen.has(key)) continue;
    seen.add(key);
    all.push({ name: name || 'Factory', phone });
  }
  return {
    recipients: all.slice(0, MAX_FACTORY_WHATSAPP_RECIPIENTS),
    dropped: Math.max(all.length - MAX_FACTORY_WHATSAPP_RECIPIENTS, 0),
  };
}
