import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class SalesOrderItemInputDto {
  @ApiProperty({ description: 'Product id (uuid). Must be one of the linked Quotation\'s products.' })
  @IsUUID()
  productId: string;

  @ApiProperty({ example: 2, default: 1, description: 'The only field a user is expected to edit before saving' })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Quantity must be at least 1' })
  quantity: number;

  @ApiPropertyOptional({
    example: 125000,
    description: 'Defaults to the unit price already recorded on the Quotation item if omitted',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Unit price must be a positive number' })
  unitPrice?: number;

  // Removed (QA decision, "Discount validation based on Sales Order
  // subtotal"): a per-line discount here was a second, independent
  // discounting mechanism alongside Quotation.discount — despite being
  // clamped at every layer (see sales-orders.service.ts's computeTotals()
  // history), its mere existence was flagged as the root risk, since
  // Quotation already has its own order-level discount that's carried
  // forward into the Sales Order's frozen totals. Discounting now only
  // ever happens at the Quotation stage; a Sales Order's own items are
  // never discounted again. The underlying SalesOrderItem.discount column
  // is left in schema.prisma (always written as 0 from here on) so
  // historical orders created before this change keep displaying whatever
  // discount they already had.

  @ApiPropertyOptional({ example: 'HVLS fan, ceiling mounted' })
  @IsOptional()
  @IsString()
  description?: string;
}
