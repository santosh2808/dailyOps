import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TelephonyTestCallStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toInteraktPhoneParts } from '../whatsapp/normalize-phone';
import { TestCallDto } from './dto/test-call.dto';
import { ExotelStatusCallbackDto } from './dto/exotel-status-callback.dto';

export interface TelephonyConfig {
  enabled: boolean;
  accountSid: string | null;
  apiKey: string | null;
  apiToken: string | null;
  callerId: string | null;
  baseUrl: string;
  flowUrl: string | null;
  statusCallbackUrl: string | null;
  recordingEnabled: boolean;
  sarvamEnabled: boolean;
  sarvamApiKey: string | null;
  voiceAgentWebSocketUrl: string | null;
}

// Exotel's own Calls/connect.json base path (Connect Two Numbers API) — see
// https://developer.exotel.com/docs/voice-v1/api-reference/connect-two-numbers.
// Overridable via EXOTEL_BASE_URL for region-specific Exotel deployments
// (e.g. singapore1.exotel.com) without a code change.
const DEFAULT_EXOTEL_BASE_URL = 'https://api.exotel.com';

// How long a just-initiated test call blocks another test call to the exact
// same number — Step 16 "prevent accidental repeated calls if possible".
// Deliberately short (this is a manual admin test button, not a queue) —
// just long enough to stop an accidental double-click from placing two
// simultaneous calls to the same phone.
const REPEAT_CALL_COOLDOWN_MS = 60_000;

@Injectable()
export class TelephonyService {
  private readonly logger = new Logger(TelephonyService.name);

  constructor(private prisma: PrismaService) {}

  // Every value read fresh from process.env on each call rather than cached
  // at construction — same reasoning as WhatsAppService/MailerService: lets
  // ops flip EXOTEL_ENABLED (or fix a misconfigured credential) with just a
  // process restart, no redeploy-time coupling.
  getConfig(): TelephonyConfig {
    return {
      enabled: (process.env.EXOTEL_ENABLED || '').trim().toLowerCase() === 'true',
      accountSid: process.env.EXOTEL_ACCOUNT_SID?.trim() || null,
      apiKey: process.env.EXOTEL_API_KEY?.trim() || null,
      apiToken: process.env.EXOTEL_API_TOKEN?.trim() || null,
      callerId: process.env.EXOTEL_CALLER_ID?.trim() || null,
      baseUrl: process.env.EXOTEL_BASE_URL?.trim() || DEFAULT_EXOTEL_BASE_URL,
      // The Exotel "Url" parameter — an App Bazaar Flow already configured
      // in the Exotel dashboard with a Voicebot Applet pointing at
      // VOICE_AGENT_WEBSOCKET_URL below. Exotel does not accept a raw
      // WebSocket URL directly on the Calls API; the Flow is where that
      // wiring lives. See the "Exotel configuration steps" in the Phase 2A
      // report for how to set this up.
      flowUrl: process.env.EXOTEL_FLOW_URL?.trim() || null,
      statusCallbackUrl: process.env.TELEPHONY_STATUS_CALLBACK_URL?.trim() || null,
      recordingEnabled: (process.env.EXOTEL_RECORDING_ENABLED || '').trim().toLowerCase() === 'true',
      sarvamEnabled: (process.env.SARVAM_ENABLED || '').trim().toLowerCase() === 'true',
      sarvamApiKey: process.env.SARVAM_API_KEY?.trim() || null,
      // Reserved for the isolated voice-agent service (Step 11/12) — not
      // called from this backend in Phase 2A. Exotel's Voicebot Applet is
      // configured (via the Flow above) to reach it directly.
      voiceAgentWebSocketUrl: process.env.VOICE_AGENT_WEBSOCKET_URL?.trim() || null,
    };
  }

  // Safe to return straight to the frontend — booleans only, never a
  // credential value (Step 7 "Do not expose... internal credentials").
  getPublicStatus() {
    const config = this.getConfig();
    return {
      exotelEnabled: config.enabled,
      exotelConfigured: Boolean(config.accountSid && config.apiKey && config.apiToken && config.callerId),
      sarvamEnabled: config.sarvamEnabled,
      sarvamConfigured: Boolean(config.sarvamApiKey),
      voiceAgentConfigured: Boolean(config.voiceAgentWebSocketUrl),
    };
  }

  async listTestCalls(take = 20) {
    return this.prisma.telephonyTestCall.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      include: { lead: { select: { id: true, leadNumber: true, companyName: true } } },
    });
  }

  async initiateTestCall(dto: TestCallDto, actorName?: string) {
    const config = this.getConfig();

    if (!config.enabled) {
      // Step 6 — exact required error message, thrown before anything is
      // written to the database (a rejected/disabled attempt is not a call
      // worth keeping a history row for).
      throw new BadRequestException('Telephony integration is currently disabled.');
    }

    const missing = [
      !config.accountSid && 'EXOTEL_ACCOUNT_SID',
      !config.apiKey && 'EXOTEL_API_KEY',
      !config.apiToken && 'EXOTEL_API_TOKEN',
      !config.callerId && 'EXOTEL_CALLER_ID',
    ].filter(Boolean);
    if (missing.length > 0) {
      throw new BadRequestException(`Telephony integration is misconfigured. Missing: ${missing.join(', ')}.`);
    }

    const phoneParts = toInteraktPhoneParts(dto.phone);
    if (!phoneParts) {
      throw new BadRequestException('Enter a valid phone number (10-digit Indian mobile, optionally with +91).');
    }
    const e164Phone = `${phoneParts.countryCode}${phoneParts.phoneNumber}`;

    let lead: { id: string } | null = null;
    if (dto.leadId) {
      lead = await this.prisma.lead.findFirst({ where: { id: dto.leadId, deletedAt: null }, select: { id: true } });
      if (!lead) {
        throw new NotFoundException('Lead not found.');
      }
    }

    const recentInFlight = await this.prisma.telephonyTestCall.findFirst({
      where: {
        phone: e164Phone,
        status: { in: ['CALLING', 'RINGING'] },
        initiatedAt: { gte: new Date(Date.now() - REPEAT_CALL_COOLDOWN_MS) },
      },
    });
    if (recentInFlight) {
      throw new ConflictException('A test call to this number was just started. Please wait before trying again.');
    }

    const testCall = await this.prisma.telephonyTestCall.create({
      data: {
        phone: e164Phone,
        leadId: lead?.id ?? null,
        status: 'CALLING',
        initiatedBy: actorName,
      },
    });

    try {
      const providerCallId = await this.callExotelConnectApi(config, e164Phone, testCall.id);
      const updated = await this.prisma.telephonyTestCall.update({
        where: { id: testCall.id },
        data: { providerCallId, providerStatus: 'in-progress' },
      });
      return updated;
    } catch (error) {
      const errorMessage = (error as Error).message || 'Unknown error contacting Exotel';
      // Never log the full error object — it can carry the request config,
      // which includes the Basic Auth header built from EXOTEL_API_KEY/
      // EXOTEL_API_TOKEN (Step 16 "log provider errors without exposing
      // secrets").
      this.logger.error(`Exotel outbound call failed for test call ${testCall.id}: ${errorMessage}`);
      return this.prisma.telephonyTestCall.update({
        where: { id: testCall.id },
        data: { status: 'FAILED', errorMessage },
      });
    }
  }

  // Best-effort against Exotel's public "Connect Two Numbers" API
  // (https://developer.exotel.com/docs/voice-v1/api-reference/connect-two-numbers)
  // — this project has no live Exotel account to validate the exact
  // request/response shape against, so treat this as a starting point to
  // verify against your own Exotel account/API version before relying on
  // it. Never invoked unless EXOTEL_ENABLED=true and all four credentials
  // are present (checked by the caller above).
  private async callExotelConnectApi(config: TelephonyConfig, toPhone: string, testCallId: string): Promise<string> {
    const url = `${config.baseUrl}/v1/Accounts/${config.accountSid}/Calls/connect.json`;
    const auth = Buffer.from(`${config.apiKey}:${config.apiToken}`).toString('base64');

    const body = new URLSearchParams();
    body.set('From', toPhone);
    body.set('CallerId', config.callerId!);
    // Prefer routing through a pre-configured Flow (which owns the
    // Voicebot Applet -> VOICE_AGENT_WEBSOCKET_URL wiring) when one is
    // configured; otherwise fall back to Exotel's default connect-only
    // behavior (rings the number with no bot attached — only useful for
    // proving the DailyOps -> Exotel -> phone leg on its own).
    if (config.flowUrl) {
      body.set('Url', config.flowUrl);
    }
    if (config.statusCallbackUrl) {
      body.set('StatusCallback', config.statusCallbackUrl);
      body.set('StatusCallbackContentType', 'application/json');
      body.append('StatusCallbackEvents[]', 'terminal');
      body.append('StatusCallbackEvents[]', 'answered');
    }
    body.set('Record', config.recordingEnabled ? 'true' : 'false');
    // Exotel doesn't accept arbitrary custom fields on this endpoint, so the
    // DailyOps-side correlation to `testCallId` lives entirely in
    // TelephonyTestCall.providerCallId (set from the response below) rather
    // than being passed to Exotel itself.
    void testCallId;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${auth}`,
      },
      body: body.toString(),
    });

    const payload: { Call?: { Sid?: string }; RestException?: { Message?: string } } | null = await res
      .json()
      .catch(() => null);

    if (!res.ok || !payload?.Call?.Sid) {
      const errorMessage = payload?.RestException?.Message || `Exotel API returned ${res.status}`;
      throw new Error(errorMessage);
    }

    return payload.Call.Sid;
  }

  // Step 8/16 — never trusts the callback body blindly: CallSid must match
  // an existing TelephonyTestCall row (created by initiateTestCall above)
  // before anything is written. An unrecognized/forged CallSid is logged
  // and ignored rather than creating a new row from arbitrary input.
  async handleStatusCallback(dto: ExotelStatusCallbackDto) {
    if (!dto.CallSid) {
      this.logger.warn('Exotel status callback received with no CallSid — ignored.');
      return { ok: false };
    }

    const testCall = await this.prisma.telephonyTestCall.findFirst({ where: { providerCallId: dto.CallSid } });
    if (!testCall) {
      this.logger.warn(`Exotel status callback for unrecognized CallSid ${dto.CallSid} — ignored.`);
      return { ok: false };
    }

    const status = this.normalizeProviderStatus(dto.Status, dto.EventType);
    const now = new Date();
    const durationSeconds = dto.ConversationDuration ? parseInt(dto.ConversationDuration, 10) || undefined : undefined;

    await this.prisma.telephonyTestCall.update({
      where: { id: testCall.id },
      data: {
        status,
        providerStatus: dto.Status || dto.EventType || testCall.providerStatus,
        ringingAt: status === 'RINGING' && !testCall.ringingAt ? now : undefined,
        answeredAt: status === 'ANSWERED' && !testCall.answeredAt ? now : undefined,
        completedAt: ['COMPLETED', 'FAILED', 'BUSY', 'NO_ANSWER'].includes(status) ? now : undefined,
        durationSeconds,
        recordingRef: dto.RecordingUrl || testCall.recordingRef,
      },
    });

    this.logger.log(`Telephony test call ${testCall.id} (CallSid ${dto.CallSid}) -> ${status}`);
    return { ok: true };
  }

  private normalizeProviderStatus(status?: string, eventType?: string): TelephonyTestCallStatus {
    const s = (status || eventType || '').toLowerCase();
    if (s.includes('ringing')) return 'RINGING';
    if (s.includes('in-progress') || s.includes('answered')) return 'ANSWERED';
    if (s.includes('completed') || s === 'terminal') return 'COMPLETED';
    if (s.includes('busy')) return 'BUSY';
    if (s.includes('no-answer') || s.includes('no_answer')) return 'NO_ANSWER';
    if (s.includes('failed')) return 'FAILED';
    return 'CALLING';
  }
}
