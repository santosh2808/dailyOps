import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateProformaInvoiceDto {
  @ApiProperty({ description: 'Id (uuid) of the existing Sales Order to generate this invoice from' })
  @IsUUID()
  salesOrderId: string;

  @ApiPropertyOptional({ example: '2026-08-02', description: 'Defaults to today if omitted' })
  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @ApiPropertyOptional({
    example: '50% advance, balance before dispatch',
    description: "Defaults to the Sales Order's payment terms if omitted",
  })
  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @ApiPropertyOptional({ example: 'HDFC Bank' })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional({ example: '50200012345678' })
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiPropertyOptional({ example: 'HDFC0001234' })
  @IsOptional()
  @IsString()
  ifscCode?: string;

  @ApiPropertyOptional({ example: 'Pune - Baner Road' })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiPropertyOptional({ example: 'Goods once sold will not be taken back.' })
  @IsOptional()
  @IsString()
  notes?: string;
}
