import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { TelephonyService } from './telephony.service';
import { ExotelStatusCallbackDto } from './dto/exotel-status-callback.dto';

// The public, unauthenticated counterpart to TelephonyController — reached
// directly by Exotel's own servers to report call status (Step 8),
// mirroring PublicFormsController's posture exactly: deliberately NO auth
// guards (Exotel cannot present a DailyOps JWT), ThrottlerGuard applied only
// to this one anonymous route rather than globally (see
// telephony.module.ts), and the payload is never trusted blindly —
// TelephonyService.handleStatusCallback() requires the CallSid to match an
// existing TelephonyTestCall row created by an admin's own test-call
// request before writing anything.
@ApiTags('telephony')
@UseGuards(ThrottlerGuard)
@Controller('api/v1/telephony/callback')
export class TelephonyCallbackController {
  constructor(private telephonyService: TelephonyService) {}

  @Post('exotel-status')
  handleExotelStatus(@Body() dto: ExotelStatusCallbackDto) {
    return this.telephonyService.handleStatusCallback(dto);
  }
}
