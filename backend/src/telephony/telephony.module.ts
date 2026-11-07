import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from '../prisma/prisma.module';
import { TelephonyService } from './telephony.service';
import { TelephonyController } from './telephony.controller';
import { TelephonyCallbackController } from './telephony-callback.controller';
import { VoiceAgentController } from './voice-agent.controller';
import { VoiceAgentCallResultService } from './voice-agent-call-result.service';
import { VoiceAgentServiceGuard } from './voice-agent-service.guard';

@Module({
  imports: [
    PrismaModule,
    // Scoped to this module/controller only (via ThrottlerGuard on
    // TelephonyCallbackController), same convention as PublicFormsModule —
    // this is the one anonymous, provider-reachable surface in this module.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }]),
  ],
  controllers: [TelephonyController, TelephonyCallbackController, VoiceAgentController],
  providers: [TelephonyService, VoiceAgentCallResultService, VoiceAgentServiceGuard],
})
export class TelephonyModule {}
