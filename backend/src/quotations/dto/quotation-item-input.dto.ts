import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

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
}
