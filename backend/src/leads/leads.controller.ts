import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequireAllPermissions, RequirePermission } from '../permissions/require-permission.decorator';
import { LeadsService } from './leads.service';
import { LeadVisibilityGuard } from './lead-visibility';
import { LeadAccessService } from './lead-access.service';
import { LeadAccessEventDto } from './dto/lead-access-event.dto';
import { DecideLeadReassignmentDto } from './dto/decide-lead-reassignment.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';
import { QueryLeadDto } from './dto/query-lead.dto';
import { ImportLeadsDto } from './dto/import-leads.dto';
import { CreateLeadNoteDto } from './dto/create-lead-note.dto';
import { ConvertToComplaintDto } from './dto/convert-to-complaint.dto';
import { UpdateLeadAiDto } from './dto/update-lead-ai.dto';
import { CreateLeadAiCallLogDto } from './dto/create-lead-ai-call-log.dto';

@ApiTags('leads')
@ApiBearerAuth()
// LeadVisibilityGuard: users outside the full-visibility roles (see
// lead-visibility.ts) get a 404 on any ':id' route for a lead not assigned to
// them. List/export are scoped inside LeadsService (they pass req.user).
@UseGuards(JwtAuthGuard, PermissionsGuard, LeadVisibilityGuard)
@Controller('api/v1/leads')
export class LeadsController {
  constructor(
    private leadsService: LeadsService,
    private leadAccess: LeadAccessService,
  ) {}

  @Get()
  @RequirePermission('Lead', 'View')
  findAll(@Query() query: QueryLeadDto, @Req() req: any) {
    return this.leadsService.findAll(query, req.user);
  }

  // Lead Import. All three are multi-segment or otherwise structurally
  // distinct from the single ':id' segment used by findOne() below, so
  // (unlike Production Dashboard/Materials Export) there's no route-order
  // collision risk here — grouped together purely for readability.
  @Get('import/template')
  @RequirePermission('Lead', 'View')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="lead-import-template.xlsx"')
  downloadImportTemplate(@Res() res: Response) {
    const buffer = this.leadsService.getLeadImportTemplate();
    res.send(buffer);
  }

  @Post('import/preview')
  @RequirePermission('Lead', 'View')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  previewImport(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded. Attach it under the "file" field.');
    }
    return this.leadsService.previewLeadImport(file.buffer);
  }

  @Post('import')
  @RequirePermission('Lead', 'Create')
  importLeads(@Body() dto: ImportLeadsDto, @Req() req: any) {
    return this.leadsService.importLeads(dto, req.user?.name);
  }

  // QA fix (TC-074 re-fail): "Download Data" — distinct from the Import
  // Template routes above (those always produce a blank header row for
  // uploading, by design). Registered ahead of the ':id' route below (same
  // route-order note as Materials Export) so 'export' is never mistaken
  // for a lead id.
  @Get('export')
  @RequirePermission('Lead', 'View')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="leads-export.xlsx"')
  async exportLeads(@Res() res: Response, @Req() req: any) {
    const { buffer, count } = await this.leadsService.exportLeads(req.user);
    await this.leadAccess.recordExport(req.user, count);
    res.send(buffer);
  }

  // Lead-access audit. Static routes — declared ahead of ':id' below.
  // Browser-reported copy/print events on Leads screens (leadId optional for
  // the list). The lead, when given, must be visible to the caller.
  @Post('access-events')
  @RequirePermission('Lead', 'View')
  async recordAccessEvent(@Body() dto: LeadAccessEventDto, @Req() req: any) {
    if (dto.leadId) await this.leadsService.assertLeadVisible(dto.leadId, req.user);
    await this.leadAccess.recordClientEvent(req.user, dto.type, dto.leadId ?? null, {
      chars: dto.chars,
      page: dto.page,
    });
    return { ok: true };
  }

  // Per-user totals of views/exports/copies/prints with "worth a look" flags.
  @Get('access-audit/summary')
  @RequirePermission('AuditLog', 'View')
  accessAuditSummary(@Query('days') days?: string) {
    const n = Math.min(365, Math.max(1, Number(days) || 30));
    return this.leadAccess.summary(n);
  }

  // Reassignment approvals (Lead.Approve: Sales Manager / Administrator).
  @Get('reassignment-requests')
  @RequirePermission('Lead', 'Approve')
  listReassignmentRequests(@Query('status') status?: string) {
    const s = status === 'APPROVED' || status === 'REJECTED' || status === 'PENDING' ? status : 'PENDING';
    return this.leadsService.listReassignmentRequests(s);
  }

  @Post('reassignment-requests/:requestId/approve')
  @RequirePermission('Lead', 'Approve')
  approveReassignment(
    @Param('requestId') requestId: string,
    @Body() dto: DecideLeadReassignmentDto,
    @Req() req: any,
  ) {
    return this.leadsService.decideReassignment(requestId, true, { id: req.user?.id, name: req.user?.name }, dto.note);
  }

  @Post('reassignment-requests/:requestId/reject')
  @RequirePermission('Lead', 'Approve')
  rejectReassignment(
    @Param('requestId') requestId: string,
    @Body() dto: DecideLeadReassignmentDto,
    @Req() req: any,
  ) {
    return this.leadsService.decideReassignment(requestId, false, { id: req.user?.id, name: req.user?.name }, dto.note);
  }

  @Get(':id')
  @RequirePermission('Lead', 'View')
  async findOne(@Param('id') id: string, @Req() req: any) {
    const lead = await this.leadsService.findOne(id);
    // Best-effort audit trail of who opened which lead (deduped per 5 min).
    await this.leadAccess.recordView(id, req.user, lead.leadNumber);
    return lead;
  }

  @Post()
  @RequirePermission('Lead', 'Create')
  create(@Body() dto: CreateLeadDto, @Req() req: any) {
    return this.leadsService.create(dto, req.user?.name);
  }

  @Patch(':id')
  @RequirePermission('Lead', 'Edit')
  update(@Param('id') id: string, @Body() dto: UpdateLeadDto, @Req() req: any) {
    return this.leadsService.update(id, dto, req.user?.name, req.user);
  }

  @Patch(':id/status')
  @RequirePermission('Lead', 'Edit')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateLeadStatusDto, @Req() req: any) {
    return this.leadsService.updateStatus(id, dto, req.user?.name);
  }

  @Delete(':id')
  @RequirePermission('Lead', 'Delete')
  remove(@Param('id') id: string) {
    return this.leadsService.remove(id);
  }

  @Post(':id/convert')
  @RequirePermission('Lead', 'Edit')
  convert(@Param('id') id: string, @Req() req: any) {
    return this.leadsService.convertToCustomer(id, req.user?.name);
  }

  // Additive: Lead <-> Complaint conversion (Website Enquiries -> Lead/Complaint
  // refactor). Requires both Lead.Edit and Complaint.Create.
  @Post(':id/convert-to-complaint')
  @RequireAllPermissions([
    ['Lead', 'Edit'],
    ['Complaint', 'Create'],
  ])
  convertToComplaint(@Param('id') id: string, @Body() dto: ConvertToComplaintDto, @Req() req: any) {
    return this.leadsService.convertToComplaint(id, req.user?.name, dto);
  }

  // Lead History / Notes — additive, read-only history + append-only notes.
  // Gated by the existing Lead.View/Lead.Edit permission codes; no new
  // Permission rows introduced for this.
  @Get(':id/history')
  @RequirePermission('Lead', 'View')
  getHistory(@Param('id') id: string) {
    return this.leadsService.getHistory(id);
  }

  @Get(':id/notes')
  @RequirePermission('Lead', 'View')
  getNotes(@Param('id') id: string) {
    return this.leadsService.getNotes(id);
  }

  @Post(':id/notes')
  @RequirePermission('Lead', 'Edit')
  addNote(@Param('id') id: string, @Body() dto: CreateLeadNoteDto, @Req() req: any) {
    return this.leadsService.addNote(id, dto, req.user?.name);
  }

  // Sales Automation requirement #16 ("Show Assignment History. Show
  // Status History. Show Email History.") — each as its own dedicated tab
  // on Lead Details, distinct from the merged Timeline above.
  @Get(':id/assignment-history')
  @RequirePermission('Lead', 'View')
  getAssignmentHistory(@Param('id') id: string) {
    return this.leadsService.getAssignmentHistory(id);
  }

  @Get(':id/status-history')
  @RequirePermission('Lead', 'View')
  getStatusHistory(@Param('id') id: string) {
    return this.leadsService.getStatusHistory(id);
  }

  // Quick-glance Lead-stage tracker (New -> ... -> Quotation Sent ->
  // Won/Lost) shown as a horizontal stepper on Lead Details — distinct
  // from the ':id/history' chronological Timeline tab above.
  @Get(':id/pipeline-timeline')
  @RequirePermission('Lead', 'View')
  getPipelineTimeline(@Param('id') id: string) {
    return this.leadsService.getPipelineTimeline(id);
  }

  @Get(':id/email-history')
  @RequirePermission('Lead', 'View')
  getEmailHistory(@Param('id') id: string) {
    return this.leadsService.getEmailHistory(id);
  }

  // Site Visit photo evidence — see LeadsService's own comment on why these
  // exist (SiteVisitOutcomeDialog on the frontend). Upload/delete require
  // Lead.Edit like every other Lead-mutating route here; the file-streaming
  // route only requires Lead.View, matching getPipelineTimeline() etc.
  // above, since it's a read, not a mutation.
  @Post(':id/site-visit-photos')
  @RequirePermission('Lead', 'Edit')
  @ApiConsumes('multipart/form-data')
  // Multer limits reject oversized/too many files while streaming, before
  // they're buffered whole in memory; the service re-checks per file.
  @UseInterceptors(
    FilesInterceptor('files', LeadsService.MAX_PHOTOS_PER_UPLOAD, {
      limits: { fileSize: LeadsService.MAX_PHOTO_SIZE_BYTES, files: LeadsService.MAX_PHOTOS_PER_UPLOAD },
    }),
  )
  uploadSiteVisitPhotos(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    // latitude/longitude/accuracyMeters arrive as plain multipart text
    // fields alongside the files (see SiteVisitOutcomeDialog.tsx's
    // FormData) — multer/Nest populate these onto @Body() the same as any
    // other form field, still as strings, hence the Number(...) parsing
    // below rather than a class-validator DTO.
    @Body() body: { latitude?: string; longitude?: string; accuracyMeters?: string },
    @Req() req: any,
  ) {
    const latitude = body?.latitude !== undefined ? Number(body.latitude) : undefined;
    const longitude = body?.longitude !== undefined ? Number(body.longitude) : undefined;
    const accuracyMeters =
      body?.accuracyMeters !== undefined && body.accuracyMeters !== '' ? Number(body.accuracyMeters) : undefined;
    return this.leadsService.uploadSiteVisitPhotos(
      id,
      files,
      req.user?.name,
      { latitude, longitude, accuracyMeters },
      req.user?.username,
    );
  }

  // Streams the raw image bytes for one photo — an authenticated route, not
  // a static-served directory (this app has no static-asset serving
  // anywhere else either), so the frontend fetches it as a blob rather than
  // a bare <img src>. See LeadsService.getSiteVisitPhotoFile()'s comment.
  @Get(':id/site-visit-photos/:photoId/file')
  @RequirePermission('Lead', 'View')
  async getSiteVisitPhotoFile(
    @Param('id') id: string,
    @Param('photoId') photoId: string,
    @Res() res: Response,
  ) {
    const { buffer, mimeType, originalName } = await this.leadsService.getSiteVisitPhotoFile(id, photoId);
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename="${originalName.replace(/"/g, '')}"`,
    });
    res.send(buffer);
  }

  @Delete(':id/site-visit-photos/:photoId')
  @RequirePermission('Lead', 'Edit')
  deleteSiteVisitPhoto(@Param('id') id: string, @Param('photoId') photoId: string) {
    return this.leadsService.deleteSiteVisitPhoto(id, photoId);
  }

  // D.O.T. AI Lead Assistant Phase 1 — internal-only endpoints (existing
  // Lead.View/Lead.Edit permissions, same JwtAuthGuard/PermissionsGuard as
  // every other route on this controller). No public/customer-facing route
  // exposes any of this. See LeadsService for what each does.
  @Get(':id/ai-call-history')
  @RequirePermission('Lead', 'View')
  getAiCallHistory(@Param('id') id: string) {
    return this.leadsService.getAiCallHistory(id);
  }

  @Patch(':id/ai')
  @RequirePermission('Lead', 'Edit')
  updateAi(@Param('id') id: string, @Body() dto: UpdateLeadAiDto, @Req() req: any) {
    return this.leadsService.updateAi(id, dto, req.user?.name);
  }

  // Manual/dev-test call logging in Phase 1 — no telephony provider calls
  // this (see CreateLeadAiCallLogDto). Gated by Lead.Edit like every other
  // Lead-mutating route on this controller.
  @Post(':id/ai-call-history')
  @RequirePermission('Lead', 'Edit')
  addAiCallLog(@Param('id') id: string, @Body() dto: CreateLeadAiCallLogDto, @Req() req: any) {
    return this.leadsService.addAiCallLog(id, dto, req.user?.name);
  }
}
