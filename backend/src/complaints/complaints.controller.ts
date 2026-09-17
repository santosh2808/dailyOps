import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequireAllPermissions, RequirePermission } from '../permissions/require-permission.decorator';
import { ComplaintsService } from './complaints.service';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { UpdateComplaintDto } from './dto/update-complaint.dto';
import { UpdateComplaintStatusDto } from './dto/update-complaint-status.dto';
import { QueryComplaintDto } from './dto/query-complaint.dto';
import { LinkInvoiceDto } from './dto/link-invoice.dto';
import { ConvertToLeadDto } from './dto/convert-to-lead.dto';
import { ReplyToCustomerDto } from './dto/reply-to-customer.dto';

@ApiTags('complaints')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/complaints')
export class ComplaintsController {
  constructor(private complaintsService: ComplaintsService) {}

  @Get()
  @RequirePermission('Complaint', 'View')
  findAll(@Query() query: QueryComplaintDto) {
    return this.complaintsService.findAll(query);
  }

  // Additive (TC-062): standalone invoice lookup for use during creation,
  // before a complaint id exists yet — reuses the same
  // findInvoiceForLookup() the id-scoped ':id/invoice-lookup' route below
  // already calls. Registered ahead of ':id' (same route-ordering rule as
  // 'export') so 'invoice-lookup' is never swallowed as a complaint id.
  @Get('invoice-lookup')
  @RequirePermission('Complaint', 'Create')
  invoiceLookupStandalone(@Query('invoiceNumber') invoiceNumber: string) {
    return this.complaintsService.findInvoiceForLookup(invoiceNumber);
  }

  // Additive (TC-061): registered ahead of ':id' so 'export' is never
  // swallowed as a complaint id (same convention as MaterialsController).
  @Get('export')
  @RequirePermission('Complaint', 'View')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="complaints-export.xlsx"')
  async export(@Query() query: QueryComplaintDto, @Res() res: Response) {
    const buffer = await this.complaintsService.exportToExcel(query);
    res.send(buffer);
  }

  @Get(':id')
  @RequirePermission('Complaint', 'View')
  findOne(@Param('id') id: string) {
    return this.complaintsService.findOne(id);
  }

  @Post()
  @RequirePermission('Complaint', 'Create')
  create(@Body() dto: CreateComplaintDto, @Req() req: any) {
    return this.complaintsService.create(dto, req.user?.name);
  }

  @Patch(':id')
  @RequirePermission('Complaint', 'Edit')
  update(@Param('id') id: string, @Body() dto: UpdateComplaintDto) {
    return this.complaintsService.update(id, dto);
  }

  @Patch(':id/status')
  @RequirePermission('Complaint', 'Edit')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateComplaintStatusDto, @Req() req: any) {
    return this.complaintsService.updateStatus(id, dto, req.user?.name);
  }

  @Delete(':id')
  @RequirePermission('Complaint', 'Delete')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.complaintsService.remove(id, req.user?.name);
  }

  // Additive: warranty verification — invoice lookup/link (requirement §8).
  @Get(':id/invoice-lookup')
  @RequirePermission('Complaint', 'Edit')
  invoiceLookup(@Param('id') _id: string, @Query('invoiceNumber') invoiceNumber: string) {
    return this.complaintsService.findInvoiceForLookup(invoiceNumber);
  }

  @Post(':id/link-invoice')
  @RequirePermission('Complaint', 'Edit')
  linkInvoice(@Param('id') id: string, @Body() dto: LinkInvoiceDto, @Req() req: any) {
    return this.complaintsService.linkInvoice(id, dto, req.user?.name);
  }

  // Additive: Complaint <-> Lead conversion. Requires both Complaint.Edit and
  // Lead.Create.
  @Post(':id/convert-to-lead')
  @RequireAllPermissions([
    ['Complaint', 'Edit'],
    ['Lead', 'Create'],
  ])
  convertToLead(@Param('id') id: string, @Body() dto: ConvertToLeadDto, @Req() req: any) {
    return this.complaintsService.convertToLead(id, req.user?.name, dto);
  }

  // Additive: staff reply to whoever reported the complaint (customer or
  // internal reporter) — reuses Mailer/EmailHistory, never a separate send
  // path. The recipient is always resolved server-side, never accepted from
  // the request body.
  @Post(':id/reply')
  @RequirePermission('Complaint', 'Edit')
  reply(@Param('id') id: string, @Body() dto: ReplyToCustomerDto, @Req() req: any) {
    return this.complaintsService.replyToCustomer(id, dto.message, req.user?.name);
  }

  @Get(':id/email-history')
  @RequirePermission('Complaint', 'View')
  getEmailHistory(@Param('id') id: string) {
    return this.complaintsService.getEmailHistory(id);
  }
}
