import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { QuotationsService, type QuotationActor } from './quotations.service';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';
import { UpdateQuotationStatusDto } from './dto/update-quotation-status.dto';
import { QueryQuotationDto } from './dto/query-quotation.dto';
import { SendQuotationDto } from './dto/send-quotation.dto';
import { RequestQuotationApprovalDto } from './dto/request-quotation-approval.dto';
import { DecideQuotationApprovalDto } from './dto/decide-quotation-approval.dto';

// actorName/actor are always captured from the authenticated user's JWT
// payload (see JwtStrategy.validate), never from the request body — same
// convention as SalesOrdersController.create()'s createdBy.
function actorFrom(req: any): QuotationActor {
  return { name: req.user?.name, roles: req.user?.roles ?? [] };
}

@ApiTags('quotations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/quotations')
export class QuotationsController {
  constructor(private quotationsService: QuotationsService) {}

  @Get()
  @RequirePermission('Quotation', 'View')
  findAll(@Query() query: QueryQuotationDto) {
    return this.quotationsService.findAll(query);
  }

  // Approvals inbox (requirement #9) — declared before ':id' so it isn't
  // swallowed by that route's :id param, same convention used by JEO's
  // 'production-dashboard' route.
  @Get('approval-requests')
  @RequirePermission('Quotation', 'Approve')
  listApprovalRequests(@Query('status') status?: string) {
    return this.quotationsService.listApprovalRequests(status);
  }

  @Get(':id')
  @RequirePermission('Quotation', 'View')
  findOne(@Param('id') id: string) {
    return this.quotationsService.findOne(id);
  }

  @Get(':id/pdf')
  @RequirePermission('Quotation', 'View')
  async getPdf(@Param('id') id: string, @Res() res: Response) {
    const pdf = await this.quotationsService.getPdf(id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${id}.pdf"` });
    res.send(pdf);
  }

  @Get(':id/email-history')
  @RequirePermission('Quotation', 'View')
  getEmailHistory(@Param('id') id: string) {
    return this.quotationsService.getEmailHistory(id);
  }

  @Post()
  @RequirePermission('Quotation', 'Create')
  create(@Body() dto: CreateQuotationDto, @Req() req: any) {
    return this.quotationsService.create(dto, req.user?.name);
  }

  @Patch(':id')
  @RequirePermission('Quotation', 'Edit')
  update(@Param('id') id: string, @Body() dto: UpdateQuotationDto) {
    return this.quotationsService.update(id, dto);
  }

  // Status transitions (including moving a quotation to ACCEPTED) are
  // gated by Quotation.Approve rather than Quotation.Edit — this is the
  // exact permission named in the Enterprise RBAC spec's own example
  // ("Permission quotation.approve should allow access"). Price
  // Validation / Approval Matrix checks run inside the service and may
  // reject this with a structured 400 body (see assertCanAccept()).
  @Patch(':id/status')
  @RequirePermission('Quotation', 'Approve')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateQuotationStatusDto, @Req() req: any) {
    return this.quotationsService.updateStatus(id, dto, actorFrom(req));
  }

  // Send Quotation (requirement #6) — any Sales role that can Edit a
  // quotation can send it; sending is not itself an approval decision.
  @Post(':id/send')
  @RequirePermission('Quotation', 'Edit')
  send(@Param('id') id: string, @Body() dto: SendQuotationDto, @Req() req: any) {
    return this.quotationsService.sendQuotation(id, dto, actorFrom(req));
  }

  // "Request Approval" button (requirement #8) — same permission as Edit,
  // since any Sales rep working the quotation should be able to escalate.
  @Post(':id/request-approval')
  @RequirePermission('Quotation', 'Edit')
  requestApproval(@Param('id') id: string, @Body() dto: RequestQuotationApprovalDto, @Req() req: any) {
    return this.quotationsService.requestApproval(id, dto, actorFrom(req));
  }

  // Deciding an approval request is an approval action — gated the same as
  // the status-change endpoint above; the service itself additionally
  // checks the decider actually holds the role the Approval Matrix
  // requires (or Administrator).
  @Patch('approval-requests/:requestId/decide')
  @RequirePermission('Quotation', 'Approve')
  decideApprovalRequest(
    @Param('requestId') requestId: string,
    @Body() dto: DecideQuotationApprovalDto,
    @Req() req: any,
  ) {
    return this.quotationsService.decideApprovalRequest(requestId, dto, actorFrom(req));
  }

  @Delete(':id')
  @RequirePermission('Quotation', 'Delete')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.quotationsService.remove(id, req.user?.name);
  }
}
