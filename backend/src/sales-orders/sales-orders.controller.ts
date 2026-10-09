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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { SalesOrdersService, type SalesOrderActor } from './sales-orders.service';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { UpdateSalesOrderDto } from './dto/update-sales-order.dto';
import { UpdateSalesOrderStatusDto } from './dto/update-sales-order-status.dto';
import { SendSalesOrderDto } from './dto/send-sales-order.dto';
import { QuerySalesOrderDto } from './dto/query-sales-order.dto';

// actor is always captured from the authenticated user's JWT payload (see
// JwtStrategy.validate), never from the request body — `roles` drives the
// dispatch-override Administrator check in SalesOrdersService.updateStatus().
// Same convention as QuotationsController's actorFrom().
function actorFrom(req: any): SalesOrderActor {
  return { name: req.user?.name, roles: req.user?.roles ?? [], email: req.user?.email };
}

@ApiTags('sales-orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/sales-orders')
export class SalesOrdersController {
  constructor(private salesOrdersService: SalesOrdersService) {}

  @Get()
  @RequirePermission('SalesOrder', 'View')
  findAll(@Query() query: QuerySalesOrderDto) {
    return this.salesOrdersService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('SalesOrder', 'View')
  findOne(@Param('id') id: string) {
    return this.salesOrdersService.findOne(id);
  }

  @Post()
  @RequirePermission('SalesOrder', 'Create')
  create(@Body() dto: CreateSalesOrderDto, @Req() req: any) {
    // createdBy is captured from the authenticated user's JWT payload
    // (see JwtStrategy.validate), never from the request body.
    return this.salesOrdersService.create(dto, req.user?.name);
  }

  @Patch(':id')
  @RequirePermission('SalesOrder', 'Edit')
  update(@Param('id') id: string, @Body() dto: UpdateSalesOrderDto) {
    return this.salesOrdersService.update(id, dto);
  }

  @Patch(':id/status')
  @RequirePermission('SalesOrder', 'Edit')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateSalesOrderStatusDto, @Req() req: any) {
    return this.salesOrdersService.updateStatus(id, dto, actorFrom(req));
  }

  @Get(':id/email-history')
  @RequirePermission('SalesOrder', 'View')
  getEmailHistory(@Param('id') id: string) {
    return this.salesOrdersService.getEmailHistory(id);
  }

  // QA fix: "there is no View PDF option in the Sales Order within the
  // application" — mirrors ProformaInvoicesController/
  // TaxInvoicesController/JobExecutionOrdersController's own GET :id/pdf.
  @Get(':id/pdf')
  @RequirePermission('SalesOrder', 'View')
  async getPdf(@Param('id') id: string, @Res() res: Response) {
    const pdf = await this.salesOrdersService.getPdf(id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${id}.pdf"` });
    res.send(pdf);
  }

  // QA bug fix (SC-007): explicit send/resend so staff can notify the
  // customer after editing a Sales Order — see
  // SalesOrdersService.sendSalesOrder()'s own comment for why this exists.
  @Post(':id/send')
  @RequirePermission('SalesOrder', 'Edit')
  sendSalesOrder(@Param('id') id: string, @Body() dto: SendSalesOrderDto, @Req() req: any) {
    return this.salesOrdersService.sendSalesOrder(id, dto, req.user?.name);
  }

  @Delete(':id')
  @RequirePermission('SalesOrder', 'Delete')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.salesOrdersService.remove(id, req.user?.name);
  }

  // Customer's Purchase Order document — a separate action from
  // create()/update() so uploading it doesn't force those JSON endpoints
  // into multipart. See SalesOrdersService.uploadCustomerPoDocument()'s
  // comment for why this is allowed at any non-CANCELLED status, unlike
  // update() which is DRAFT-only.
  @Post(':id/po-document')
  @RequirePermission('SalesOrder', 'Edit')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  uploadPoDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: any,
  ) {
    return this.salesOrdersService.uploadCustomerPoDocument(id, file, req.user?.name);
  }

  // Streams the raw file bytes — an authenticated route, not a
  // static-served directory, same convention as
  // LeadsController.getSiteVisitPhotoFile().
  @Get(':id/po-document/file')
  @RequirePermission('SalesOrder', 'View')
  async getPoDocumentFile(@Param('id') id: string, @Res() res: Response) {
    const { buffer, mimeType, originalName } = await this.salesOrdersService.getCustomerPoDocumentFile(id);
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename="${originalName.replace(/"/g, '')}"`,
    });
    res.send(buffer);
  }

  @Delete(':id/po-document')
  @RequirePermission('SalesOrder', 'Edit')
  deletePoDocument(@Param('id') id: string) {
    return this.salesOrdersService.deleteCustomerPoDocument(id);
  }
}
