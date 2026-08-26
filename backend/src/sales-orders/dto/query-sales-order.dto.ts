import { ApiPropertyOptional } from '@nestjs/swagger';
import { SalesOrderStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class QuerySalesOrderDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({
    example: 'acme',
    description: "Matches sales order number, quotation number, or the linked customer's company name / contact person",
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: SalesOrderStatus })
  @IsOptional()
  @IsEnum(SalesOrderStatus)
  status?: SalesOrderStatus;

  @ApiPropertyOptional({ description: 'Filter by customer id (uuid)' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Filter by the originating quotation id (uuid)' })
  @IsOptional()
  @IsUUID()
  quotationId?: string;

  // Additive: Dashboard Redesign v2 — India Sales Map. Sales Orders have
  // no state of their own; this filters by the linked Customer's state
  // (see Customer.state).
  @ApiPropertyOptional({ example: 'Maharashtra', description: "Filter by the linked customer's state" })
  @IsOptional()
  @IsString()
  customerState?: string;

  // Additive: Dashboard Redesign v2 — Sales Executive Performance /
  // Global Filters. SalesOrder.createdBy is a plain actor-name string
  // (see that field's own schema comment), so this is an exact match on
  // that name, not a user id.
  @ApiPropertyOptional({ example: 'Priya Sharma', description: "Filter by the order's createdBy name" })
  @IsOptional()
  @IsString()
  createdBy?: string;

  // Additive: Dashboard Redesign v2 — Top Products / Global Filters.
  // Matches orders that have at least one line item for this product.
  @ApiPropertyOptional({ description: 'Filter by orders containing this product id (uuid)' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ example: '2026-01-01', description: 'orderDate >= dateFrom' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'orderDate <= dateTo' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({
    example: 'createdAt',
    enum: ['createdAt', 'updatedAt', 'salesOrderNumber', 'grandTotal', 'orderDate', 'deliveryDate', 'status'],
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ example: 'desc', enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
