import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateTaxInvoiceDto {
  @ApiProperty({ description: 'Id (uuid) of the existing Sales Order to generate this Tax Invoice from' })
  @IsUUID()
  salesOrderId: string;

  @ApiPropertyOptional({ example: '2026-08-27', description: 'Defaults to today if omitted' })
  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  // Mandatory: required on the printed Tax Invoice, matches the reference
  // template's "Buyer's Order No." field — no longer silently falls back to
  // "Verbal".
  @ApiProperty({ example: 'PO-12345' })
  @IsString()
  @IsNotEmpty({ message: "Buyer's Order No. is required" })
  buyersOrderNo: string;

  @ApiPropertyOptional({ example: 'By Road', description: "Defaults to 'By Road' if omitted" })
  @IsOptional()
  @IsString()
  dispatchedThrough?: string;

  // Mandatory: the actual delivery destination — no longer optional.
  @ApiProperty({ example: 'Hyderabad' })
  @IsString()
  @IsNotEmpty({ message: 'Destination is required' })
  destination: string;

  // Mandatory: no longer silently falls back to the generic
  // "Packing/Installation/Freight: Inclusive" default.
  @ApiProperty({ example: 'Packing: Inclusive\nInstallation: Inclusive\nFreight: Inclusive' })
  @IsString()
  @IsNotEmpty({ message: 'Terms of Delivery is required' })
  termsOfDelivery: string;
}
