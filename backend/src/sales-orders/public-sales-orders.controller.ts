import { Controller, Get, Header, Param, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { SalesOrdersService } from './sales-orders.service';

// Customer order tracking — the public, no-login read behind the /track/
// {token} page linked from the sales order WhatsApp messages. No guards,
// same as PublicQuotationsController: the token is the only credential,
// and SalesOrdersService.getPublicTracking() validates it and rate-limits
// by client IP itself.
@ApiTags('public-sales-orders')
@Controller('api/v1/public/sales-orders')
export class PublicSalesOrdersController {
  constructor(private salesOrdersService: SalesOrdersService) {}

  @Get('track/:token')
  // Status changes must show on the next open, never from a cache.
  @Header('Cache-Control', 'no-store')
  getTracking(@Param('token') token: string, @Req() req: Request) {
    return this.salesOrdersService.getPublicTracking(token, req.ip || 'unknown');
  }
}
