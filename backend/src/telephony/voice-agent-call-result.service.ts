import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, TelephonyResultLeadMatch } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from '../common/phone.util';
import { writeAiCallResultToLead, AiFieldSuggestion } from '../leads/ai-call-result';
import { VoiceAgentCallResultDto } from './dto/voice-agent-call-result.dto';
import { leadAiStatusFor, sanitizeVoiceAgentResult, RejectedField } from './voice-agent-result';

// performedBy on the LeadAiCallLog / Timeline entry — a service, not a person.
export const VOICE_AGENT_ACTOR = 'D.O.T. voice agent';

// Pipeline stages that mean the lead is closed — never "active" for matching.
const CLOSED_LEAD_STATUSES = ['WON', 'LOST'] as const;

export interface VoiceAgentCallResultResponse {
  ok: true;
  testCallId: string;
  // true when this exact call's result had already been recorded — nothing
  // was changed by this submission.
  duplicate: boolean;
  leadMatch?: TelephonyResultLeadMatch | null;
  // Whether this call's result was written to a lead (for a duplicate: by
  // the original submission). false when it stayed on the test call only.
  attachedToLead: boolean;
  rejectedFields?: string[];
}

type LeadResolution = { kind: TelephonyResultLeadMatch; leadId?: string };

// D.O.T. call-result write-back (Phase 0).
//
// Correlation is by Exotel CallSid ONLY: the result must match exactly one
// TelephonyTestCall.providerCallId (set when DailyOps itself placed the
// call). Unknown → 404, ambiguous → 409, and nothing is written in either
// case — a result is never guessed onto a call or a lead. (Verified on two
// real calls: the stream's call_sid equals the Connect API's Call.Sid.)
//
// Which lead (approved Decision 15). "Active" = not deleted, not WON/LOST.
// A phone "matches" when the lead's primary OR alternate phone normalizes
// (same rules as normalizePhone()) to the call's 10-digit number.
//   1. The test call was started for a specific lead → that lead, but only
//      if it is still active AND one of its phones matches the dialled
//      number; otherwise the result stays on the test call.
//   2. Otherwise, exactly ONE active lead matching the number → that lead.
//   3. Zero or several matching active leads → the result stays on the
//      test call only.
// Never "the most recent lead with that number".
//
// Idempotent: the whole submission is one transaction that first claims the
// call via a conditional update on aiResultReceivedAt. A repeat (retry,
// duplicate delivery, concurrent double-submit) finds it already claimed
// and returns duplicate:true without writing anything. A failure part-way
// rolls everything back, so the voice-agent can safely retry.
@Injectable()
export class VoiceAgentCallResultService {
  private readonly logger = new Logger(VoiceAgentCallResultService.name);

  constructor(private prisma: PrismaService) {}

  async submit(dto: VoiceAgentCallResultDto): Promise<VoiceAgentCallResultResponse> {
    const calls = await this.prisma.telephonyTestCall.findMany({
      where: { providerCallId: dto.callSid },
      select: { id: true, phone: true, leadId: true },
      take: 2,
    });
    if (calls.length === 0) {
      this.logger.warn(`Voice-agent result for unknown CallSid ${dto.callSid} — ignored, nothing written.`);
      throw new NotFoundException('No call matches this call identifier.');
    }
    if (calls.length > 1) {
      this.logger.error(`Voice-agent result for CallSid ${dto.callSid} matches several calls — ignored, nothing written.`);
      throw new ConflictException('This call identifier is ambiguous.');
    }
    const call = calls[0];

    // Diagnostic only (never a reason to reject): the CallSid match above is
    // what ties the result to our call. Logs the shape of a mismatch, never
    // either value.
    const accountSidMismatch = this.checkAccountSid(call.id, dto.accountSid);

    const { result, rejected } = sanitizeVoiceAgentResult(dto);

    const response = await this.prisma.$transaction(async (tx): Promise<VoiceAgentCallResultResponse> => {
      const claimed = await tx.telephonyTestCall.updateMany({
        where: { id: call.id, aiResultReceivedAt: null },
        data: { aiResultReceivedAt: new Date() },
      });
      if (claimed.count === 0) {
        // Already recorded (READ COMMITTED: a concurrent first submission has
        // committed by the time this conditional update stops waiting on its
        // row lock), so report what that submission did.
        const original = await tx.telephonyTestCall.findUnique({
          where: { id: call.id },
          select: { aiResultLeadMatch: true, aiResultLeadId: true },
        });
        return {
          ok: true,
          testCallId: call.id,
          duplicate: true,
          leadMatch: original?.aiResultLeadMatch ?? null,
          attachedToLead: Boolean(original?.aiResultLeadId),
        };
      }

      const lead = await this.resolveLead(tx, call);
      let fieldSuggestions: AiFieldSuggestion[] = [];
      let writtenToLeadId: string | null = null;
      let leadAlreadyHadThisCall = false;
      if (lead.leadId) {
        const alreadyLogged = await tx.leadAiCallLog.findFirst({
          where: { leadId: lead.leadId, externalCallId: dto.callSid },
          select: { id: true },
        });
        if (alreadyLogged) {
          leadAlreadyHadThisCall = true;
        } else {
          ({ suggestions: fieldSuggestions } = await writeAiCallResultToLead(
            tx,
            lead.leadId,
            {
              status: leadAiStatusFor(result),
              externalCallId: dto.callSid,
              startedAt: result.startedAt ? new Date(result.startedAt) : undefined,
              endedAt: result.endedAt ? new Date(result.endedAt) : undefined,
              durationSeconds: result.durationSeconds,
              qualification: result.qualification,
              summary: result.summary,
              quantity: result.quantity,
              application: result.application,
              timeline: result.timeline,
              city: result.city,
              state: result.state,
              siteVisitRequested: result.siteVisitRequested,
              callbackRequested: result.callbackRequested,
              callbackAt: result.callbackAt ? new Date(result.callbackAt) : undefined,
            },
            VOICE_AGENT_ACTOR,
          ));
          writtenToLeadId = lead.leadId;
        }
      }

      await tx.telephonyTestCall.update({
        where: { id: call.id },
        data: {
          aiResultOutcome: result.outcome,
          aiResult: {
            ...result,
            rejectedFields: rejected,
            fieldSuggestions,
            ...(accountSidMismatch ? { accountSidMismatch: true } : {}),
            ...(leadAlreadyHadThisCall ? { leadAlreadyHadThisCall: true } : {}),
          } as unknown as Prisma.InputJsonValue,
          aiResultLeadMatch: lead.kind,
          // Only set when THIS result was actually written to the lead.
          aiResultLeadId: writtenToLeadId,
        },
      });

      return {
        ok: true,
        testCallId: call.id,
        duplicate: false,
        leadMatch: lead.kind,
        attachedToLead: writtenToLeadId !== null,
        rejectedFields: rejected.map((r: RejectedField) => r.field),
      };
    });

    this.logger.log(
      response.duplicate
        ? `Voice-agent result for test call ${call.id} (CallSid ${dto.callSid}) already recorded — duplicate ignored.`
        : `Voice-agent result for test call ${call.id} (CallSid ${dto.callSid}): outcome=${result.outcome} ` +
            `leadMatch=${response.leadMatch} attachedToLead=${response.attachedToLead} ` +
            `rejectedFields=[${response.rejectedFields?.join(',') ?? ''}]`,
    );
    return response;
  }

  // Returns true (and logs a safe diagnostic) when the stream reported an
  // Exotel account that differs from EXOTEL_ACCOUNT_SID. Never rejects.
  private checkAccountSid(testCallId: string, reported?: string): boolean {
    const configured = process.env.EXOTEL_ACCOUNT_SID?.trim();
    const presented = reported?.trim();
    if (!configured || !presented || presented === configured) return false;
    this.logger.warn(
      `Voice-agent result for test call ${testCallId}: Exotel account id differs from EXOTEL_ACCOUNT_SID ` +
        `(reported length ${presented.length}, configured length ${configured.length}, ` +
        `equal ignoring case: ${presented.toLowerCase() === configured.toLowerCase()}). ` +
        'Processed anyway — the CallSid identifies the call.',
    );
    return true;
  }

  private async resolveLead(
    tx: Prisma.TransactionClient,
    call: { phone: string; leadId: string | null },
  ): Promise<LeadResolution> {
    const phone = normalizePhone(call.phone);

    if (call.leadId) {
      const explicit = await tx.lead.findFirst({
        where: { id: call.leadId, deletedAt: null, status: { notIn: [...CLOSED_LEAD_STATUSES] } },
        select: { id: true, phone: true, alternatePhone: true },
      });
      if (!explicit) return { kind: 'LEAD_UNAVAILABLE' };
      const leadPhones = [normalizePhone(explicit.phone), normalizePhone(explicit.alternatePhone)];
      if (!phone || !leadPhones.includes(phone)) return { kind: 'EXPLICIT_LEAD_PHONE_MISMATCH' };
      return { kind: 'EXPLICIT_LEAD', leadId: explicit.id };
    }

    if (!phone) return { kind: 'NO_MATCH' };

    const matches = await this.findActiveLeadsByPhone(tx, phone);
    if (matches.length === 1) return { kind: 'SINGLE_MATCH', leadId: matches[0].id };
    return { kind: matches.length === 0 ? 'NO_MATCH' : 'MULTIPLE_MATCHES' };
  }

  // Active leads whose primary OR alternate phone normalizes to `phone`,
  // using exactly normalizePhone()'s rules in SQL (strip non-digits; accept
  // 10 digits, 12 starting "91", or 11 starting "0"), so numbers stored in
  // any format the app has ever written ("+91 98765 43210", "098765...")
  // are found, while a longer or shorter number never matches. LIMIT 2 is
  // all Decision 15 needs: "exactly one" vs "several".
  private findActiveLeadsByPhone(tx: Prisma.TransactionClient, phone: string): Promise<{ id: string }[]> {
    return tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM (
        SELECT id,
               regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') AS p,
               regexp_replace(coalesce("alternatePhone", ''), '[^0-9]', '', 'g') AS a
        FROM "Lead"
        WHERE "deletedAt" IS NULL AND status::text NOT IN ('WON', 'LOST')
      ) digits
      WHERE (CASE WHEN length(p) = 10 THEN p
                  WHEN length(p) = 12 AND left(p, 2) = '91' THEN substr(p, 3)
                  WHEN length(p) = 11 AND left(p, 1) = '0' THEN substr(p, 2) END) = ${phone}
         OR (CASE WHEN length(a) = 10 THEN a
                  WHEN length(a) = 12 AND left(a, 2) = '91' THEN substr(a, 3)
                  WHEN length(a) = 11 AND left(a, 1) = '0' THEN substr(a, 2) END) = ${phone}
      LIMIT 2`;
  }
}
