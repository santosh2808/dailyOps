import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { AuditLogService } from './audit-log.service';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';

// Read-only — AuditLog rows are only ever written by AuditLogService.record()
// from inside other modules' own service methods, never via this
// controller. Gated by its own permission (Administrator-only by default,
// per seed.ts) rather than piggybacking on any other module's permission.
@ApiTags('audit-log')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/audit-log')
export class AuditLogController {
  constructor(private auditLogService: AuditLogService) {}

  @Get()
  @RequirePermission('AuditLog', 'View')
  findAll(@Query() query: QueryAuditLogDto) {
    return this.auditLogService.findAll(query);
  }
}
