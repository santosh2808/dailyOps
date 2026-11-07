import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';

export const VOICE_AGENT_KEY_HEADER = 'x-voice-agent-key';
// A shorter configured key is treated as "not configured" (fail closed)
// rather than accepted — guards against a placeholder like "changeme".
export const MIN_VOICE_AGENT_KEY_LENGTH = 32;

// D.O.T. call-result write-back (Phase 0) — service-to-service auth for the
// voice-agent, replacing its old login as an ordinary DailyOps user (which
// failed on HTTP 201 and, when it worked, saw only that user's own leads).
//
// - The key is a shared secret in VOICE_AGENT_SERVICE_KEY on both services,
//   read fresh from process.env per request (same convention as
//   TelephonyService.getConfig()), never logged or returned.
// - It authenticates exactly ONE route (the call-result submission) and
//   grants nothing else: it is not a JWT, carries no user, roles or
//   permissions, so every normal-user route still requires a DailyOps JWT
//   and RBAC as before.
// - Unset/too-short key → 503 (feature off, fail closed). Missing/wrong
//   header → 401. Compared via SHA-256 digests + timingSafeEqual so neither
//   content nor length leaks through timing.
@Injectable()
export class VoiceAgentServiceGuard implements CanActivate {
  private readonly logger = new Logger(VoiceAgentServiceGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const configured = process.env.VOICE_AGENT_SERVICE_KEY?.trim() ?? '';
    if (configured.length < MIN_VOICE_AGENT_KEY_LENGTH) {
      this.logger.warn('Voice-agent result submission refused: VOICE_AGENT_SERVICE_KEY is not configured.');
      throw new ServiceUnavailableException('Voice-agent result submission is not configured.');
    }

    const request = context.switchToHttp().getRequest();
    const presented = request.headers?.[VOICE_AGENT_KEY_HEADER];
    if (typeof presented !== 'string' || presented.length === 0) {
      throw new UnauthorizedException('Voice-agent credentials are required.');
    }

    const expectedDigest = createHash('sha256').update(configured).digest();
    const presentedDigest = createHash('sha256').update(presented.trim()).digest();
    if (!timingSafeEqual(expectedDigest, presentedDigest)) {
      this.logger.warn('Voice-agent result submission refused: invalid service key.');
      throw new UnauthorizedException('Invalid voice-agent credentials.');
    }
    return true;
  }
}
