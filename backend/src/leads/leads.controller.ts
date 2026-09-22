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
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/leads')
export class LeadsController {
  constructor(private leadsService: LeadsService) {}

  @Get()
  @RequirePermission('Lead', 'View')
  findAll(@Query() query: QueryLeadDto) {
    return this.leadsService.findAll(query);
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
  importLeads(@Body() dto: ImportLeadsDto) {
    return this.leadsService.importLeads(dto);
  }

  @Get(':id')
  @RequirePermission('Lead', 'View')
  findOne(@Param('id') id: string) {
    return this.leadsService.findOne(id);
  }

  @Post()
  @RequirePermission('Lead', 'Create')
  create(@Body() dto: CreateLeadDto, @Req() req: any) {
    return this.leadsService.create(dto, req.user?.name);
  }

  @Patch(':id')
  @RequirePermission('Lead', 'Edit')
  update(@Param('id') id: string, @Body() dto: UpdateLeadDto, @Req() req: any) {
    return this.leadsService.update(id, dto, req.user?.name);
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
  @UseInterceptors(FilesInterceptor('files', 10))
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
    return this.leadsService.uploadSiteVisitPhotos(id, files, req.user?.name, {
      latitude,
      longitude,
      accuracyMeters,
    });
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
