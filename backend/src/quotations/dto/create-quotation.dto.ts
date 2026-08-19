import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuotationStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { QuotationItemInputDto } from './quotation-item-input.dto';

export class CreateQuotationDto {
  @ApiProperty({ description: 'Customer id (uuid)' })
  @IsUUID()
  customerId: string;

  @ApiPropertyOptional({ enum: QuotationStatus, default: QuotationStatus.DRAFT })
  @IsOptional()
  @IsEnum(QuotationStatus)
  status?: QuotationStatus;

  @ApiProperty({ type: [QuotationItemInputDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'A quotation needs at least one item' })
  @ValidateNested({ each: true })
  @Type(() => QuotationItemInputDto)
  items: QuotationItemInputDto[];

  @ApiPropertyOptional({ example: 18, default: 18, description: 'GST percentage applied to the subtotal' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'GST percent must be a positive number' })
  gstPercent?: number;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @ApiPropertyOptional({ example: 'Prices valid for 30 days from issue date.' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: '50% advance, balance on delivery.' })
  @IsOptional()
  @IsString()
  terms?: string;
}
