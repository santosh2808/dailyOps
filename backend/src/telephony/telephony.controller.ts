import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { TelephonyService } from './telephony.service';
import { TestCallDto } from './dto/test-call.dto';

// D.O.T. AI Lead Assistant Phase 2A — Telephony Test Foundation. Admin-only:
// same JwtAuthGuard/PermissionsGuard convention as every other authenticated
// controller in this app (see AiSettingsController). The Exotel status
// callback lives in a separate, deliberately unauthenticated controller —
// see telephony-callback.controller.ts — mirroring how
// PublicFormsController is split out from FormConfigurationController.
@ApiTags('telephony')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/telephony')
export class TelephonyController {
  constructor(private telephonyService: TelephonyService) {}

  // Booleans only (enabled/configured flags) — never a credential value.
  @Get('status')
  @RequirePermission('Telephony', 'Test')
  getStatus() {
    return this.telephonyService.getPublicStatus();
  }

  @Get('test-calls')
  @RequirePermission('Telephony', 'Test')
  listTestCalls(@Query('take') take?: string) {
    const parsed = take ? parseInt(take, 10) : undefined;
    return this.telephonyService.listTestCalls(parsed && !Number.isNaN(parsed) ? parsed : undefined);
  }

  // Step 6/9 — the ONLY way a call is ever placed in this phase: an admin
  // explicitly submitting this form. Nothing in this codebase calls
  // initiateTestCall() automatically; there is no cron job, queue, worker,
  // or Lead-status trigger anywhere near this module (Step 9/16).
  @Post('test-call')
  @RequirePermission('Telephony', 'Test')
  makeTestCall(@Body() dto: TestCallDto, @Req() req: any) {
    return this.telephonyService.initiateTestCall(dto, req.user?.name);
  }
}
