import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
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

  @Post()
  @RequirePermission('ProformaInvoice', 'Create')
  create(@Body() dto: CreateProformaInvoiceDto) {
    return this.proformaInvoicesService.create(dto);
  }

  @Patch(':id/status')
  @RequirePermission('ProformaInvoice', 'Edit')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateProformaInvoiceStatusDto) {
    return this.proformaInvoicesService.updateStatus(id, dto);
  }

  // No PDF endpoint yet — see the "Future Ready" comment on the
  // ProformaInvoice model in schema.prisma for the intended
  // GET :id/pdf extension point. Left out deliberately, per scope.
}
