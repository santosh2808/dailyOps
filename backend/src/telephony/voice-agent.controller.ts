import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { VoiceAgentServiceGuard } from './voice-agent-service.guard';
import { VoiceAgentCallResultService } from './voice-agent-call-result.service';
import { VoiceAgentCallResultDto } from './dto/voice-agent-call-result.dto';

// D.O.T. call-result write-back (Phase 0) — the voice-agent's only route
// into DailyOps. Service-key auth (VoiceAgentServiceGuard), NOT a user JWT:
// the voice-agent is not an employee and can't read or list leads, it can
// only submit the result of a call DailyOps itself placed. Hidden from
// Swagger since no person or frontend should ever call it.
// ThrottlerGuard runs FIRST (this module's 30/min/IP limit, same as the
// Exotel callback route), so a flood of bad-key requests is cut off before
// the key check — and its warning log — runs. A throttled voice-agent gets
// 429, which it retries with backoff.
@ApiExcludeController()
@UseGuards(ThrottlerGuard, VoiceAgentServiceGuard)
@Controller('api/v1/telephony/voice-agent')
export class VoiceAgentController {
  constructor(private callResults: VoiceAgentCallResultService) {}

  // 200 (not Nest's default 201) — a repeat submission creates nothing.
  // The voice-agent accepts any 2xx regardless.
  @Post('call-results')
  @HttpCode(200)
  submitCallResult(@Body() dto: VoiceAgentCallResultDto) {
    return this.callResults.submit(dto);
  }
}
