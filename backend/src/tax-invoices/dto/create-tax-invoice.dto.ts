import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateTaxInvoiceDto {
  @ApiProperty({ description: 'Id (uuid) of the existing Sales Order to generate this Tax Invoice from' })
  @IsUUID()
  salesOrderId: string;

  @ApiPropertyOptional({ example: '2026-08-27', description: 'Defaults to today if omitted' })
  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @ApiPropertyOptional({ example: 'Verbal', description: "Defaults to 'Verbal' if omitted" })
  @IsOptional()
  @IsString()
  buyersOrderNo?: string;

  @ApiPropertyOptional({ example: 'By Road', description: "Defaults to 'By Road' if omitted" })
  @IsOptional()
  @IsString()
  dispatchedThrough?: string;

  @ApiPropertyOptional({ example: 'Hyderabad' })
  @IsOptional()
  @IsString()
  destination?: string;

  @ApiPropertyOptional({ example: 'Packing: Inclusive\nInstallation: Inclusive\nFreight: Inclusive' })
  @IsOptional()
  @IsString()
  termsOfDelivery?: string;
}
