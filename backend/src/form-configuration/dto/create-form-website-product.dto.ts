import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateFormWebsiteProductDto {
  @ApiProperty({ description: 'The canonical Product (id, uuid) this mapping exposes' })
  @IsUUID()
  productId: string;

  @ApiProperty({ example: 'SPYRO-24', description: "This website's own code for the product" })
  @IsString()
  @IsNotEmpty({ message: 'Public code is required' })
  publicCode: string;

  @ApiProperty({ example: 'Spyro 24' })
  @IsString()
  @IsNotEmpty({ message: 'Label is required' })
  label: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  displayOrder?: number;

  @ApiPropertyOptional({ description: 'Optional product-specific field schema/config for this website\'s form' })
  @IsOptional()
  @IsObject()
  fieldConfig?: Record<string, unknown>;
}
