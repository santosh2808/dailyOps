import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { JobExecutionOrdersService } from './job-execution-orders.service';
import { CreateJeoDto } from './dto/create-jeo.dto';
import { UpdateJeoDto } from './dto/update-jeo.dto';
import { UpdateJeoStatusDto } from './dto/update-jeo-status.dto';
import { UpdateProductionChecklistDto } from './dto/update-production-checklist.dto';
import { SendJeoDto } from './dto/send-jeo.dto';
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

  // Edit a JEO's own fields (priority/assignedTo/remarks/Scope of Work) —
  // added as a bug fix; this module previously had no edit endpoint at
  // all. Uses the existing JEO:Update permission (there is no separate
  // JEO:Edit permission seeded) — same permission the status/checklist
  // routes below already require.
  @Patch(':id')
  @RequirePermission('JEO', 'Update')
  update(@Param('id') id: string, @Body() dto: UpdateJeoDto, @Req() req: any) {
    return this.jobExecutionOrdersService.update(id, dto, req.user?.name);
  }

  @Patch(':id/status')
  @RequirePermission('JEO', 'Update')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateJeoStatusDto, @Req() req: any) {
    return this.jobExecutionOrdersService.updateStatus(id, dto, req.user?.name);
  }

  // Explicit (re)send of the factory notification email — added as a bug
  // fix alongside update() above; previously the only send was an
  // automatic, non-repeatable one inside create().
  @Post(':id/send')
  @RequirePermission('JEO', 'Update')
  sendFactoryNotification(@Param('id') id: string, @Body() dto: SendJeoDto, @Req() req: any) {
    return this.jobExecutionOrdersService.sendFactoryNotification(id, dto, req.user?.name);
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

  @Get(':id/pdf')
  @RequirePermission('JEO', 'View')
  async getPdf(@Param('id') id: string, @Req() req: any, @Res() res: Response) {
    const pdf = await this.jobExecutionOrdersService.getPdf(id, req.user?.name);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${id}.pdf"` });
    res.send(pdf);
  }

  // No delete endpoint — JobExecutionOrder has no deletedAt column (per the
  // given field list), so there is no delete capability for this module at
  // all. (Edit now exists — see update() above — but delete remains out of
  // scope.) No Material Planning/BOM/Dispatch endpoints yet — see the
  // "Future Ready" comment on the JobExecutionOrder model in schema.prisma
  // for the intended extension points.
}
