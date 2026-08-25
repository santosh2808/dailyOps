import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { JobExecutionOrdersService } from './job-execution-orders.service';
import { CreateJeoDto } from './dto/create-jeo.dto';
import { UpdateJeoStatusDto } from './dto/update-jeo-status.dto';
import { UpdateProductionChecklistDto } from './dto/update-production-checklist.dto';
import { QueryJeoDto } from './dto/query-jeo.dto';

@ApiTags('job-execution-orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/job-execution-orders')
export class JobExecutionOrdersController {
  constructor(private jobExecutionOrdersService: JobExecutionOrdersService) {}

  @Get()
  @RequirePermission('JEO', 'View')
  findAll(@Query() query: QueryJeoDto) {
    return this.jobExecutionOrdersService.findAll(query);
  }

  // Declared before ':id' — this is a static path, so it must come first or
  // NestJS/Express would try to match "production-dashboard" as an :id
  // value and route it to findOne() instead.
  @Get('production-dashboard')
  @RequirePermission('JEO', 'View')
  getProductionDashboard() {
    return this.jobExecutionOrdersService.getProductionDashboard();
  }

  @Get(':id')
  @RequirePermission('JEO', 'View')
  findOne(@Param('id') id: string) {
    return this.jobExecutionOrdersService.findOne(id);
  }

  @Get(':id/timeline')
  @RequirePermission('JEO', 'View')
  getTimeline(@Param('id') id: string) {
    return this.jobExecutionOrdersService.getTimeline(id);
  }

  @Get(':id/email-history')
  @RequirePermission('JEO', 'View')
  getEmailHistory(@Param('id') id: string) {
    return this.jobExecutionOrdersService.getEmailHistory(id);
  }

  @Post()
  @RequirePermission('JEO', 'Create')
  create(@Body() dto: CreateJeoDto, @Req() req: any) {
    return this.jobExecutionOrdersService.create(dto, req.user?.name);
  }

  @Patch(':id/status')
  @RequirePermission('JEO', 'Update')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateJeoStatusDto, @Req() req: any) {
    return this.jobExecutionOrdersService.updateStatus(id, dto, req.user?.name);
  }

  // Partial update of one or more Production Checklist booleans — the "Start
  // Production" / "Mark QC Complete" / "Ready For Dispatch" quick actions in
  // the UI call this alongside `:id/status`, and the checklist card also
  // calls it directly per-checkbox.
  @Patch(':id/checklist')
  @RequirePermission('JEO', 'Update')
  updateChecklist(@Param('id') id: string, @Body() dto: UpdateProductionChecklistDto) {
    return this.jobExecutionOrdersService.updateChecklist(id, dto);
  }

  // No edit/delete endpoint — JobExecutionOrder has no deletedAt column
  // (per the given field list), so there is no delete capability for this
  // module at all. No PDF/Material Planning/BOM/Dispatch endpoints yet — see
  // the "Future Ready" comment on the JobExecutionOrder model in
  // schema.prisma for the intended extension points. Left out deliberately,
  // per scope.
}
