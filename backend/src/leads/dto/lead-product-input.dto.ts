import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class LeadProductInputDto {
  @ApiProperty({ description: 'Product id (uuid)' })
  @IsUUID()
  productId: string;

  @ApiProperty({ example: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Quantity must be at least 1' })
  quantity: number;

  @ApiPropertyOptional({ example: 125000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Unit price must be a positive number' })
  unitPrice?: number;

  @ApiPropertyOptional({ example: 'Customer requested 2 units for the west wing' })
  @IsOptional()
  @IsString()
  remarks?: string;

  // Bug fix: "Generate Quotation" derives its items straight from this
  // lead's products (see QuotationsService.create()), and a fan-type
  // product's Quotation item can't be saved without a confirmed paint
  // Color (QuotationsService.computeTotals()) — with no field here to
  // capture one, that one-click action always failed for any lead with a
  // fan product, with nowhere in the flow to fix it. Mirrors
  // QuotationItemInputDto.color/colorCharge exactly.
  @ApiPropertyOptional({ example: 'Aluminium', description: 'Paint color, required for fan products' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ example: 10000, description: 'Extra flat charge for this color, not multiplied by quantity' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Color charge must be a positive number' })
  colorCharge?: number;
}
