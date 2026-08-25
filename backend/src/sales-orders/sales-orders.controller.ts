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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { SalesOrdersService } from './sales-orders.service';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { UpdateSalesOrderDto } from './dto/update-sales-order.dto';
import { UpdateSalesOrderStatusDto } from './dto/update-sales-order-status.dto';
import { QuerySalesOrderDto } from './dto/query-sales-order.dto';

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
    return this.salesOrdersService.updateStatus(id, dto, req.user?.name);
  }

  @Get(':id/email-history')
  @RequirePermission('SalesOrder', 'View')
  getEmailHistory(@Param('id') id: string) {
    return this.salesOrdersService.getEmailHistory(id);
  }

  @Delete(':id')
  @RequirePermission('SalesOrder', 'Delete')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.salesOrdersService.remove(id, req.user?.name);
  }
}
