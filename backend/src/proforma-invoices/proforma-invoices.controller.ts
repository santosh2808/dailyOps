import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { ProformaInvoicesService, type ProformaInvoiceActor } from './proforma-invoices.service';
import { CreateProformaInvoiceDto } from './dto/create-proforma-invoice.dto';
import { UpdateProformaInvoiceDto } from './dto/update-proforma-invoice.dto';
import { UpdateProformaInvoiceStatusDto } from './dto/update-proforma-invoice-status.dto';
import { UpdateProformaInvoiceAdvanceDto } from './dto/update-proforma-invoice-advance.dto';
import { SendProformaInvoiceDto } from './dto/send-proforma-invoice.dto';
import { QueryProformaInvoiceDto } from './dto/query-proforma-invoice.dto';

@ApiTags('proforma-invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/proforma-invoices')
export class ProformaInvoicesController {
  constructor(private proformaInvoicesService: ProformaInvoicesService) {}

  @Get()
  @RequirePermission('ProformaInvoice', 'View')
  findAll(@Query() query: QueryProformaInvoiceDto) {
    return this.proformaInvoicesService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('ProformaInvoice', 'View')
  findOne(@Param('id') id: string) {
    return this.proformaInvoicesService.findOne(id);
  }

  @Get(':id/email-history')
  @RequirePermission('ProformaInvoice', 'View')
  getEmailHistory(@Param('id') id: string) {
    return this.proformaInvoicesService.getEmailHistory(id);
  }

  @Post()
  @RequirePermission('ProformaInvoice', 'Create')
  create(@Body() dto: CreateProformaInvoiceDto, @Req() req: any) {
    return this.proformaInvoicesService.create(dto, req.user?.name);
  }

  @Patch(':id')
  @RequirePermission('ProformaInvoice', 'Edit')
  update(@Param('id') id: string, @Body() dto: UpdateProformaInvoiceDto, @Req() req: any) {
    return this.proformaInvoicesService.update(id, dto, req.user?.name);
  }

  @Patch(':id/status')
  @RequirePermission('ProformaInvoice', 'Edit')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateProformaInvoiceStatusDto, @Req() req: any) {
    return this.proformaInvoicesService.updateStatus(id, dto, req.user?.name);
  }

  @Post(':id/send')
  @RequirePermission('ProformaInvoice', 'Edit')
  sendInvoice(@Param('id') id: string, @Body() dto: SendProformaInvoiceDto, @Req() req: any) {
    return this.proformaInvoicesService.sendInvoice(id, dto, req.user?.name);
  }

  @Patch(':id/advance')
  @RequirePermission('ProformaInvoice', 'Edit')
  updateAdvance(@Param('id') id: string, @Body() dto: UpdateProformaInvoiceAdvanceDto, @Req() req: any) {
    const actor: ProformaInvoiceActor = { name: req.user?.name, roles: req.user?.roles ?? [] };
    return this.proformaInvoicesService.updateAdvance(id, dto, actor);
  }

  @Get(':id/pdf')
  @RequirePermission('ProformaInvoice', 'View')
  async getPdf(@Param('id') id: string, @Res() res: Response) {
    const pdf = await this.proformaInvoicesService.getPdf(id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${id}.pdf"` });
    res.send(pdf);
  }

  // QA bug fix (SC-006): pull the current Sales Order's subtotal/discount
  // /tax/grandTotal back onto this invoice — see
  // ProformaInvoicesService.regenerateFromSalesOrder()'s own comment for
  // why this exists (amounts are a one-time snapshot, not a live value)
  // and what it deliberately leaves untouched (advanceReceived, jeoId,
  // manually-edited metadata).
  @Post(':id/regenerate')
  @RequirePermission('ProformaInvoice', 'Edit')
  regenerateFromSalesOrder(@Param('id') id: string, @Req() req: any) {
    return this.proformaInvoicesService.regenerateFromSalesOrder(id, req.user?.name);
  }

  // Additive: WhatsApp Share via Interakt — sends the document directly to
  // the customer's WhatsApp (rather than returning a link for the browser
  // to open a wa.me chat with).
  @Post(':id/whatsapp-send')
  @RequirePermission('ProformaInvoice', 'Edit')
  sendWhatsApp(@Param('id') id: string) {
    return this.proformaInvoicesService.sendWhatsAppShare(id);
  }
}
