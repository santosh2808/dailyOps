import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { AiSettingsService } from './ai-settings.service';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';

// D.O.T. AI Lead Assistant Phase 1 — internal admin settings only. Same
// JwtAuthGuard/PermissionsGuard convention as every other controller in
// this app; no public/customer-facing route touches this.
@ApiTags('ai-settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/ai-settings')
export class AiSettingsController {
  constructor(private aiSettingsService: AiSettingsService) {}

  @Get()
  @RequirePermission('AiSettings', 'View')
  get() {
    return this.aiSettingsService.get();
  }

  @Patch()
  @RequirePermission('AiSettings', 'Edit')
  update(@Body() dto: UpdateAiSettingsDto, @Req() req: any) {
    return this.aiSettingsService.update(dto, req.user?.name);
  }
}
