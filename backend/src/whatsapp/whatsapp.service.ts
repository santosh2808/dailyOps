import { Injectable, Logger } from '@nestjs/common';
import { toInteraktPhoneParts } from './normalize-phone';

export interface WhatsAppSendOptions {
  phone: string | null | undefined;
  templateName: string;
  languageCode?: string;
  bodyValues: string[];
}

export interface WhatsAppSendResult {
  status: 'SENT' | 'SIMULATED' | 'FAILED';
  errorMessage?: string;
}

const INTERAKT_SEND_URL = 'https://api.interakt.ai/v1/public/message/';

// Additive: WhatsApp Share — real send via the company's Interakt account
// (a WhatsApp Business API Solution Provider), replacing the earlier
// click-to-chat (wa.me) links. Every outgoing WhatsApp document share
// (Quotation/Proforma Invoice/Tax Invoice/JEO) goes through here.
//
// Mirrors MailerService's own "Future Ready" convention exactly: with
// INTERAKT_API_KEY unset (the default — no real credentials are available
// at build time in this environment), a send is SIMULATED — logged in
// full, nothing goes out over the network — rather than the feature
// silently breaking or throwing. Deliberately never throws for the same
// reason MailerService doesn't: the caller (a business action like
// generating/reviewing a document) shouldn't fail just because a WhatsApp
// send didn't go through; it gets a typed SENT/SIMULATED/FAILED result
// back and decides how to surface it.
//
// Interakt-specific notes (see
// https://www.interakt.shop/resource-center/how-to-send-whatsapp-templates-using-apis-webhooks/):
// - Auth is HTTP Basic with the API key as the "user" — the header is
//   literally `Authorization: Basic <API_KEY>`, not base64("key:") like
//   typical Basic Auth.
// - `template.name` must be the exact code name of a template already
//   created (or synced from Meta Business Manager) and APPROVED inside
//   Interakt — sending an unrecognized/unapproved name fails with a
//   descriptive error in the JSON response, not an HTTP error necessarily.
// - Public message-send APIs are not available on Interakt's Starter
//   plan — only Growth and above.
@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly apiKey = process.env.INTERAKT_API_KEY?.trim() || null;

  async sendTemplateMessage(options: WhatsAppSendOptions): Promise<WhatsAppSendResult> {
    const { phone, templateName, bodyValues } = options;
    const languageCode = options.languageCode || process.env.INTERAKT_TEMPLATE_LANGUAGE?.trim() || 'en';

    const parts = toInteraktPhoneParts(phone);
    if (!parts) {
      return { status: 'FAILED', errorMessage: 'No valid phone number on file for this customer.' };
    }

    if (!this.apiKey) {
      this.logger.log(
        `[SIMULATED WhatsApp] to ${parts.countryCode}${parts.phoneNumber} via template "${templateName}" (${languageCode}): ${JSON.stringify(bodyValues)}`,
      );
      return { status: 'SIMULATED' };
    }

    try {
      const res = await fetch(INTERAKT_SEND_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${this.apiKey}`,
        },
        body: JSON.stringify({
          countryCode: parts.countryCode,
          phoneNumber: parts.phoneNumber,
          type: 'Template',
          template: {
            name: templateName,
            languageCode,
            bodyValues,
          },
        }),
      });

      const payload: { result?: boolean; message?: string; id?: string } | null = await res
        .json()
        .catch(() => null);

      if (!res.ok || payload?.result !== true) {
        const errorMessage = payload?.message || `Interakt API returned ${res.status}`;
        this.logger.error(`Interakt send failed for template "${templateName}": ${errorMessage}`);
        return { status: 'FAILED', errorMessage };
      }

      this.logger.log(`WhatsApp sent via Interakt: template "${templateName}" -> message id ${payload.id}`);
      return { status: 'SENT' };
    } catch (error) {
      const errorMessage = (error as Error).message || 'Unknown error contacting Interakt';
      this.logger.error(`Interakt send threw for template "${templateName}": ${errorMessage}`);
      return { status: 'FAILED', errorMessage };
    }
  }
}
