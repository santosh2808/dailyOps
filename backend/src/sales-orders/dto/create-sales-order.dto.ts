import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { SalesOrderItemInputDto } from './sales-order-item-input.dto';

export class CreateSalesOrderDto {
  @ApiProperty({ description: 'Id (uuid) of the ACCEPTED Quotation this Sales Order is created from' })
  @IsUUID()
  quotationId: string;

  @ApiProperty({
    type: [SalesOrderItemInputDto],
    description:
      'Must cover the same products as the linked Quotation. Quantity is the only field a user is expected to edit before saving.',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'A sales order needs at least one item' })
  @ValidateNested({ each: true })
  @Type(() => SalesOrderItemInputDto)
  items: SalesOrderItemInputDto[];

  @ApiPropertyOptional({ example: '2026-08-01', description: 'Defaults to today if omitted' })
  @IsOptional()
  @IsDateString()
  orderDate?: string;

  @ApiPropertyOptional({ example: '2026-09-15' })
  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @ApiPropertyOptional({ example: '50% advance, balance before dispatch' })
  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @ApiPropertyOptional({ example: 50, description: 'Percentage of the grand total expected as advance' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  advancePercentage?: number;

  @ApiPropertyOptional({ example: 18, default: 18, description: 'GST percentage applied to each line item' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'GST percent must be a positive number' })
  gstPercent?: number;

  @ApiPropertyOptional({
    example: 0,
    default: 0,
    description: 'Additional flat discount applied at the order level, on top of any per-line discounts',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Discount must be a positive number' })
  discount?: number;

  @ApiPropertyOptional({ example: 'Acme Corp, 123 Industrial Estate, Pune' })
  @IsOptional()
  @IsString()
  billingAddress?: string;

  @ApiPropertyOptional({ example: 'Acme Corp Warehouse, Plot 4, MIDC, Pune' })
  @IsOptional()
  @IsString()
  shippingAddress?: string;

  @ApiPropertyOptional({ example: 'Deliver during working hours only' })
  @IsOptional()
  @IsString()
  specialInstructions?: string;

  @ApiPropertyOptional({ example: 'Customer requested expedited production' })
  @IsOptional()
  @IsString()
  remarks?: string;
}
