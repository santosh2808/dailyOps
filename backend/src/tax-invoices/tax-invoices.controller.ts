import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { TaxInvoicesService } from './tax-invoices.service';
import { CreateTaxInvoiceDto } from './dto/create-tax-invoice.dto';
import { UpdateTaxInvoiceDto } from './dto/update-tax-invoice.dto';
import { UpdateTaxInvoiceStatusDto } from './dto/update-tax-invoice-status.dto';
import { QueryTaxInvoiceDto } from './dto/query-tax-invoice.dto';
import { SendTaxInvoiceDto } from './dto/send-tax-invoice.dto';
import { UpdateTaxInvoiceEInvoiceDto } from './dto/update-tax-invoice-einvoice.dto';

@ApiTags('tax-invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/tax-invoices')
export class TaxInvoicesController {
  constructor(private taxInvoicesService: TaxInvoicesService) {}

  @Get()
  @RequirePermission('TaxInvoice', 'View')
  findAll(@Query() query: QueryTaxInvoiceDto) {
    return this.taxInvoicesService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('TaxInvoice', 'View')
  findOne(@Param('id') id: string) {
    return this.taxInvoicesService.findOne(id);
  }

  @Get(':id/email-history')
  @RequirePermission('TaxInvoice', 'View')
  getEmailHistory(@Param('id') id: string) {
    return this.taxInvoicesService.getEmailHistory(id);
  }

  @Post()
  @RequirePermission('TaxInvoice', 'Create')
  create(@Body() dto: CreateTaxInvoiceDto, @Req() req: any) {
    return this.taxInvoicesService.create(dto, req.user?.name);
  }

  @Patch(':id')
  @RequirePermission('TaxInvoice', 'Edit')
  update(@Param('id') id: string, @Body() dto: UpdateTaxInvoiceDto, @Req() req: any) {
    return this.taxInvoicesService.update(id, dto, req.user?.name);
  }

  @Patch(':id/status')
  @RequirePermission('TaxInvoice', 'Edit')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateTaxInvoiceStatusDto, @Req() req: any) {
    return this.taxInvoicesService.updateStatus(id, dto, req.user?.name);
  }

  @Post(':id/send')
  @RequirePermission('TaxInvoice', 'Edit')
  sendInvoice(@Param('id') id: string, @Body() dto: SendTaxInvoiceDto, @Req() req: any) {
    return this.taxInvoicesService.sendInvoice(id, dto, req.user?.name);
  }

  @Patch(':id/e-invoice')
  @RequirePermission('TaxInvoice', 'Edit')
  updateEInvoiceDetails(
    @Param('id') id: string,
    @Body() dto: UpdateTaxInvoiceEInvoiceDto,
    @Req() req: any,
  ) {
    return this.taxInvoicesService.updateEInvoiceDetails(id, dto, req.user?.name);
  }

  @Get(':id/pdf')
  @RequirePermission('TaxInvoice', 'View')
  async getPdf(@Param('id') id: string, @Res() res: Response) {
    const pdf = await this.taxInvoicesService.getPdf(id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${id}.pdf"` });
    res.send(pdf);
  }
}
