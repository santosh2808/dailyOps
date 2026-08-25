import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { ProformaInvoicesService } from './proforma-invoices.service';
import { CreateProformaInvoiceDto } from './dto/create-proforma-invoice.dto';
import { UpdateProformaInvoiceStatusDto } from './dto/update-proforma-invoice-status.dto';
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

  @Patch(':id/status')
  @RequirePermission('ProformaInvoice', 'Edit')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateProformaInvoiceStatusDto, @Req() req: any) {
    return this.proformaInvoicesService.updateStatus(id, dto, req.user?.name);
  }

  // No standalone PDF-download endpoint — the PDF is generated internally
  // by create() purely to attach to the automatic email (see
  // sendInvoiceEmail()); nothing in scope calls for a separate download
  // button on this module the way Quotation's GET :id/pdf does.
}
