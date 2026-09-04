import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

// productId is immutable after creation (the @@unique([formWebsiteId,
// productId]) pair identifies the mapping) — this deliberately does NOT
// extend CreateFormWebsiteProductDto, same convention as UpdateComplaintDto.
export class UpdateFormWebsiteProductDto {
  @ApiPropertyOptional({ example: 'SPYRO-24' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Public code cannot be blank' })
  publicCode?: string;

  @ApiPropertyOptional({ example: 'Spyro 24' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Label cannot be blank' })
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  displayOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  fieldConfig?: Record<string, unknown>;
}
