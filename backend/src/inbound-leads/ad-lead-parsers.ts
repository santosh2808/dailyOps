import { createHmac, timingSafeEqual } from 'crypto';

// Pure helpers for the ad-platform lead webhooks (no I/O), so they can be unit
// tested on their own.

export interface ParsedAdLead {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  city?: string;
  state?: string;
  // Everything else the form asked (custom questions, ad/campaign ids), as
  // "Question: answer" lines for the lead's description.
  details: string;
}

function prettify(label: string): string {
  const s = label.replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function join(first?: string, last?: string): string | undefined {
  const full = [first, last].filter(Boolean).join(' ').trim();
  return full || undefined;
}

// Meta Lead Ads `field_data`: [{ name: 'full_name', values: ['A B'] }, ...]
export function parseMetaFieldData(
  fieldData: { name?: string; values?: string[] }[] | undefined,
  meta: { adId?: string; campaignId?: string; formId?: string } = {},
): ParsedAdLead {
  const std: Record<string, string> = {};
  const extras: string[] = [];
  for (const f of fieldData ?? []) {
    const key = (f.name ?? '').toLowerCase();
    const value = (f.values ?? []).join(', ').trim();
    if (!key || !value) continue;
    if (
      ['full_name', 'first_name', 'last_name', 'email', 'phone_number', 'company_name', 'city', 'state', 'province'].includes(
        key,
      )
    ) {
      std[key] = value;
    } else {
      extras.push(`${prettify(key)}: ${value}`);
    }
  }
  const ids = [
    meta.formId && `Form ${meta.formId}`,
    meta.campaignId && `Campaign ${meta.campaignId}`,
    meta.adId && `Ad ${meta.adId}`,
  ].filter(Boolean);
  if (ids.length) extras.push(`Source: Meta lead ad (${ids.join(', ')})`);
  return {
    name: std.full_name ?? join(std.first_name, std.last_name),
    email: std.email,
    phone: std.phone_number,
    company: std.company_name,
    city: std.city,
    state: std.state ?? std.province,
    details: extras.join('\n'),
  };
}

// Google Ads lead form webhook `user_column_data`:
// [{ column_id: 'FULL_NAME', column_name: 'Full Name', string_value: '...' }]
export function parseGoogleColumns(
  columns: { column_id?: string; column_name?: string; string_value?: string }[] | undefined,
  meta: { campaignId?: string; formId?: string; adgroupId?: string } = {},
): ParsedAdLead {
  const std: Record<string, string> = {};
  const extras: string[] = [];
  for (const c of columns ?? []) {
    const id = (c.column_id ?? '').toUpperCase();
    const value = (c.string_value ?? '').trim();
    if (!value) continue;
    if (['FULL_NAME', 'FIRST_NAME', 'LAST_NAME', 'EMAIL', 'PHONE_NUMBER', 'COMPANY_NAME', 'CITY', 'REGION'].includes(id)) {
      std[id] = value;
    } else if (id !== 'POSTAL_CODE' && id !== 'COUNTRY') {
      extras.push(`${c.column_name || prettify(id.toLowerCase())}: ${value}`);
    }
  }
  const ids = [
    meta.formId && `Form ${meta.formId}`,
    meta.campaignId && `Campaign ${meta.campaignId}`,
    meta.adgroupId && `Ad group ${meta.adgroupId}`,
  ].filter(Boolean);
  if (ids.length) extras.push(`Source: Google Ads lead form (${ids.join(', ')})`);
  return {
    name: std.FULL_NAME ?? join(std.FIRST_NAME, std.LAST_NAME),
    email: std.EMAIL,
    phone: std.PHONE_NUMBER,
    company: std.COMPANY_NAME,
    city: std.CITY,
    state: std.REGION,
    details: extras.join('\n'),
  };
}

// Meta sends `X-Hub-Signature-256: sha256=<hmac of the raw body, app secret>`.
export function verifyMetaSignature(rawBody: Buffer | undefined, header: string | undefined, appSecret: string): boolean {
  if (!rawBody || !header || !header.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const given = header.slice('sha256='.length);
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
