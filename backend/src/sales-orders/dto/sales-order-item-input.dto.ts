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

  @ApiPropertyOptional({ example: 5000, default: 0, description: 'Flat discount amount for this line' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Discount must be a positive number' })
  discount?: number;

  @ApiPropertyOptional({ example: 'HVLS fan, ceiling mounted' })
  @IsOptional()
  @IsString()
  description?: string;
}
