import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { sendAisensyCampaign } from './aisensy';
import { maskPhone, toAisensyDestination, toInteraktPhoneParts } from './normalize-phone';
import { WHATSAPP_USE_CASES, type WhatsAppUseCase } from './whatsapp-use-cases';

export interface WhatsAppSendOptions {
  phone: string | null | undefined;
  templateName: string;
  languageCode?: string;
  bodyValues: string[];
  // AiSensy integration — picks the campaign and the rules for this send
  // (see whatsapp-use-cases.ts). Ignored by the Interakt path.
  useCase: WhatsAppUseCase;
  // The document being shared; required for a real AiSensy send so it can
  // be recorded in WhatsAppMessage and protected against duplicates.
  documentId?: string;
  sentBy?: string;
}

// SENT: Interakt accepted it. ACCEPTED: AiSensy accepted it — WhatsApp
// delivery is not confirmed. UNKNOWN: AiSensy did not confirm either way
// (timeout/5xx). DUPLICATE: the same document already went to the same
// number moments ago, so this one was not sent.
export interface WhatsAppSendResult {
  status: 'SENT' | 'ACCEPTED' | 'SIMULATED' | 'FAILED' | 'UNKNOWN' | 'DUPLICATE';
  errorMessage?: string;
}

// A repeat of the same document to the same number inside this window is
// refused instead of sent — covers double-clicks, two open tabs and a
// retry straight after an UNKNOWN result.
export const WHATSAPP_DUPLICATE_WINDOW_MS = 2 * 60 * 1000;
// Statuses that mean a message may have gone out (or is going out now).
const IN_FLIGHT_OR_SENT = ['PENDING', 'ACCEPTED', 'UNKNOWN'];
// Meta's per-variable limit for template body parameters.
const MAX_PARAM_LENGTH = 1024;

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
//
// AiSensy integration: with WHATSAPP_PROVIDER=aisensy, every send goes
// through sendViaAisensy() instead. Anything else (including unset, the
// default) keeps the Interakt behaviour above unchanged.
@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly apiKey = process.env.INTERAKT_API_KEY?.trim() || null;
  private readonly provider = process.env.WHATSAPP_PROVIDER?.trim().toLowerCase() || null;
  private readonly aisensyApiKey = process.env.AISENSY_API_KEY?.trim() || null;

  constructor(private prisma: PrismaService) {
    if (this.provider && this.provider !== 'aisensy' && this.provider !== 'interakt') {
      this.logger.warn(`Unknown WHATSAPP_PROVIDER "${this.provider}" — using the Interakt path.`);
    }
  }

  async sendTemplateMessage(options: WhatsAppSendOptions): Promise<WhatsAppSendResult> {
    if (this.provider === 'aisensy') return this.sendViaAisensy(options);

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

  // Never throws, same as the Interakt path. Order matters: everything that
  // can be checked locally is checked before anything is recorded or sent,
  // and the duplicate claim is recorded before the request goes out.
  private async sendViaAisensy(options: WhatsAppSendOptions): Promise<WhatsAppSendResult> {
    const { useCase } = options;
    const config = WHATSAPP_USE_CASES[useCase];
    if (!config) {
      this.logger.error(`WhatsApp send with unknown use case "${useCase}" — not sent.`);
      return { status: 'FAILED', errorMessage: 'WhatsApp is not set up for this message type.' };
    }

    const destination = toAisensyDestination(options.phone);
    if (!destination) {
      return { status: 'FAILED', errorMessage: 'No valid Indian mobile number on file for this customer.' };
    }

    // Use cases that can't send for real are simulated before their values
    // are validated — a blank field on a lead mustn't log an error for a
    // message that was never going to go out.
    if (!config.campaignEnv) {
      this.logger.log(`[SIMULATED WhatsApp] ${useCase} to ${maskPhone(destination)} (not approved for real sends)`);
      return { status: 'SIMULATED' };
    }

    const params = normalizeTemplateParams(options.bodyValues, config.paramCount);
    if ('error' in params) {
      this.logger.error(`WhatsApp ${useCase} not sent: ${params.error}`);
      return { status: 'FAILED', errorMessage: params.error };
    }

    const campaignName = process.env[config.campaignEnv]?.trim() || null;
    if (!this.aisensyApiKey || !campaignName) {
      const reason = !this.aisensyApiKey ? 'AISENSY_API_KEY not set' : `${config.campaignEnv} not set`;
      this.logger.log(`[SIMULATED WhatsApp] ${useCase} to ${maskPhone(destination)} (${reason}), ${params.values.length} params`);
      if (options.documentId) {
        await this.record({ ...options, documentId: options.documentId }, destination, null, 'SIMULATED').catch((error) =>
          this.logger.warn(`Could not record simulated WhatsApp ${useCase}: ${dbErrorCode(error)}`),
        );
      }
      return { status: 'SIMULATED' };
    }

    if (!options.documentId) {
      this.logger.error(`WhatsApp ${useCase} not sent: no document id to record it against.`);
      return { status: 'FAILED', errorMessage: 'WhatsApp is not set up for this message type.' };
    }

    let messageId: string | null;
    try {
      messageId = await this.claim({ ...options, documentId: options.documentId }, destination, campaignName);
    } catch (error) {
      this.logger.error(`WhatsApp ${useCase} not sent: could not record it (${dbErrorCode(error)})`);
      return { status: 'FAILED', errorMessage: 'Could not record the WhatsApp message, so it was not sent. Please try again.' };
    }
    if (!messageId) {
      return {
        status: 'DUPLICATE',
        errorMessage: `This was already sent to this number in the last ${WHATSAPP_DUPLICATE_WINDOW_MS / 60_000} minutes, so it was not sent again.`,
      };
    }

    const outcome = await sendAisensyCampaign(
      {
        apiKey: this.aisensyApiKey,
        campaignName,
        destination,
        userName: params.values[config.recipientNameParam],
        templateParams: params.values,
      },
    );

    if (outcome.status === 'ACCEPTED') {
      this.logger.log(`WhatsApp ${useCase} accepted by AiSensy for ${maskPhone(destination)} (message ${messageId})`);
    } else {
      this.logger.error(`WhatsApp ${useCase} ${outcome.status} for ${maskPhone(destination)} (message ${messageId}): ${outcome.errorMessage}`);
    }
    await this.prisma.whatsAppMessage
      .update({ where: { id: messageId }, data: { status: outcome.status, errorMessage: outcome.errorMessage ?? null } })
      .catch((error) => this.logger.error(`Could not update WhatsApp message ${messageId}: ${dbErrorCode(error)}`));

    return outcome;
  }

  // Records a PENDING row unless the same document already went (or is
  // going) to the same number inside the duplicate window. The advisory
  // lock serialises the check-then-insert across every backend instance,
  // so two simultaneous clicks can't both pass. Returns null for a
  // duplicate.
  private claim(
    options: WhatsAppSendOptions & { documentId: string },
    destination: string,
    campaignName: string,
  ): Promise<string | null> {
    const key = `whatsapp:${options.useCase}:${options.documentId}:${destination}`;
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
      const recent = await tx.whatsAppMessage.findFirst({
        where: {
          useCase: options.useCase,
          documentId: options.documentId,
          destination,
          status: { in: IN_FLIGHT_OR_SENT },
          createdAt: { gte: new Date(Date.now() - WHATSAPP_DUPLICATE_WINDOW_MS) },
        },
        select: { id: true },
      });
      if (recent) return null;
      const row = await tx.whatsAppMessage.create({
        data: {
          provider: 'AISENSY',
          useCase: options.useCase,
          documentId: options.documentId,
          destination,
          campaignName,
          status: 'PENDING',
          sentBy: options.sentBy ?? null,
        },
        select: { id: true },
      });
      return row.id;
    });
  }

  private async record(
    options: WhatsAppSendOptions & { documentId: string },
    destination: string,
    campaignName: string | null,
    status: string,
  ): Promise<void> {
    await this.prisma.whatsAppMessage.create({
      data: {
        provider: 'AISENSY',
        useCase: options.useCase,
        documentId: options.documentId,
        destination,
        campaignName,
        status,
        sentBy: options.sentBy ?? null,
      },
    });
  }
}

// Prisma error messages can quote the query's arguments (the phone number),
// so only the error code/name is logged.
function dbErrorCode(error: unknown): string {
  const { code, name } = (error ?? {}) as { code?: string; name?: string };
  return code || name || 'unknown database error';
}

// WhatsApp rejects template variables containing newlines, tabs or long
// runs of spaces, so whitespace is collapsed rather than failing on it. An
// empty variable or the wrong number of them would be rejected by AiSensy
// (and still cost a send), so those fail here instead.
export function normalizeTemplateParams(
  bodyValues: unknown[],
  expected: number,
): { values: string[] } | { error: string } {
  if (bodyValues.length !== expected) {
    return { error: `WhatsApp template expects ${expected} values but got ${bodyValues.length}.` };
  }
  const values = bodyValues.map((v) => String(v ?? '').replace(/\s+/g, ' ').trim());
  const empty = values.findIndex((v) => !v);
  if (empty !== -1) return { error: `The WhatsApp message is missing a required value ({{${empty + 1}}}).` };
  const tooLong = values.findIndex((v) => v.length > MAX_PARAM_LENGTH);
  if (tooLong !== -1) return { error: `WhatsApp value {{${tooLong + 1}}} is longer than ${MAX_PARAM_LENGTH} characters.` };
  return { values };
}
