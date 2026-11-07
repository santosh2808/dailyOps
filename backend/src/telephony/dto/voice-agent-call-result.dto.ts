import { VoiceAgentCallOutcome } from '@prisma/client';
import { Allow, IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

// D.O.T. call-result write-back (Phase 0) — what the voice-agent submits
// after an answered call, keyed by the Exotel CallSid.
//
// Only the two deterministic fields (callSid, outcome) are strictly
// validated here: a bad one means the submission can't be trusted or
// matched at all, so it is rejected with 400. Every AI-extracted field is
// declared with @Allow() so the global `whitelist: true` ValidationPipe
// keeps it, and is then validated field-by-field in
// sanitizeVoiceAgentResult() — one invalid value is dropped and recorded
// instead of failing the whole submission. There is deliberately NO phone
// number field: the call is identified by CallSid only.
export class VoiceAgentCallResultDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,128}$/, { message: 'callSid is not a valid call identifier.' })
  callSid: string;

  @IsEnum(VoiceAgentCallOutcome)
  outcome: VoiceAgentCallOutcome;

  // Exotel account the call came through (from the WebSocket `start`
  // event). When both sides know it, a mismatch is rejected.
  @IsOptional()
  @IsString()
  @MaxLength(128)
  accountSid?: string;

  @Allow() qualification?: unknown;
  @Allow() summary?: unknown;
  @Allow() quantity?: unknown;
  @Allow() application?: unknown;
  @Allow() timeline?: unknown;
  @Allow() city?: unknown;
  @Allow() state?: unknown;
  @Allow() siteVisitRequested?: unknown;
  @Allow() callbackRequested?: unknown;
  @Allow() callbackAt?: unknown;
  @Allow() startedAt?: unknown;
  @Allow() endedAt?: unknown;
  @Allow() durationSeconds?: unknown;
  @Allow() agentErrors?: unknown;
}
