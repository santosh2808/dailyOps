import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { QuotationsService } from './quotations.service';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';
import { UpdateQuotationStatusDto } from './dto/update-quotation-status.dto';
import { QueryQuotationDto } from './dto/query-quotation.dto';

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

  @Get(':id')
  @RequirePermission('Quotation', 'View')
  findOne(@Param('id') id: string) {
    return this.quotationsService.findOne(id);
  }

  @Post()
  @RequirePermission('Quotation', 'Create')
  create(@Body() dto: CreateQuotationDto) {
    return this.quotationsService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('Quotation', 'Edit')
  update(@Param('id') id: string, @Body() dto: UpdateQuotationDto) {
    return this.quotationsService.update(id, dto);
  }

  // Status transitions (including moving a quotation to ACCEPTED) are
  // gated by Quotation.Approve rather than Quotation.Edit — this is the
  // exact permission named in the Enterprise RBAC spec's own example
  // ("Permission quotation.approve should allow access").
  @Patch(':id/status')
  @RequirePermission('Quotation', 'Approve')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateQuotationStatusDto) {
    return this.quotationsService.updateStatus(id, dto);
  }

  @Delete(':id')
  @RequirePermission('Quotation', 'Delete')
  remove(@Param('id') id: string) {
    return this.quotationsService.remove(id);
  }
}
