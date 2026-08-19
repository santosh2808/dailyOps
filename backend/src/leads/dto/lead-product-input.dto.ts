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
}
