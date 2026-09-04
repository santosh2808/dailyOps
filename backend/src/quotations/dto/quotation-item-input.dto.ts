import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HangingStructureType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class QuotationItemInputDto {
  @ApiProperty({ description: 'Product id (uuid)' })
  @IsUUID()
  productId: string;

  @ApiPropertyOptional({ example: 'HVLS fan, ceiling mounted' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Quantity must be at least 1' })
  quantity: number;

  @ApiPropertyOptional({
    example: 125000,
    description: 'Defaults to the product catalog price if omitted',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Unit price must be a positive number' })
  unitPrice?: number;

  // Additive: per-fan color/hanging-structure pricing, collected here so
  // JEO generation can pre-fill from the quotation instead of asking again.
  // See the schema comment on QuotationItem for why these are per-item
  // rather than per-quotation.
  @ApiPropertyOptional({ example: 'Custom RAL 9016 White' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ example: 3500, description: 'Extra flat charge for this line\'s color, not multiplied by quantity' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Color charge must be a positive number' })
  colorCharge?: number;

  @ApiPropertyOptional({ enum: HangingStructureType })
  @IsOptional()
  @IsEnum(HangingStructureType)
  hangingStructureType?: HangingStructureType;

  @ApiPropertyOptional({ example: '3 ft', description: 'Only meaningful when hangingStructureType is PIPE_TRUSS' })
  @IsOptional()
  @IsString()
  pipeLength?: string;

  @ApiPropertyOptional({ example: 5000, description: 'Extra flat charge for this line\'s hanging structure, not multiplied by quantity' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Hanging structure charge must be a positive number' })
  hangingStructureCharge?: number;
}
