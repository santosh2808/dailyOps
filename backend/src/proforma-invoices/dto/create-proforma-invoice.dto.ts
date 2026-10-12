import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

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

  @ApiProperty({ example: 'HDFC Bank' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Bank Name is required' })
  // Typed optional so the automatic quotation-acceptance cascade
  // (createFromSalesOrder) can still call create() without them; the
  // manual Generate flow is enforced by the HTTP validation above.
  bankName?: string;

  @ApiProperty({ example: '50200012345678' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Account Number is required' })
  // Typed optional so the automatic quotation-acceptance cascade
  // (createFromSalesOrder) can still call create() without them; the
  // manual Generate flow is enforced by the HTTP validation above.
  accountNumber?: string;

  @ApiProperty({ example: 'HDFC0001234' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'IFSC Code is required' })
  // Typed optional so the automatic quotation-acceptance cascade
  // (createFromSalesOrder) can still call create() without them; the
  // manual Generate flow is enforced by the HTTP validation above.
  ifscCode?: string;

  @ApiProperty({ example: 'Pune - Baner Road' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Branch is required' })
  // Typed optional so the automatic quotation-acceptance cascade
  // (createFromSalesOrder) can still call create() without them; the
  // manual Generate flow is enforced by the HTTP validation above.
  branch?: string;

  @ApiPropertyOptional({ example: 'Goods once sold will not be taken back.' })
  @IsOptional()
  @IsString()
  notes?: string;

  // PDF "Advance received" / "Receivable" rows (see schema.prisma comment
  // on ProformaInvoice.advanceReceived) — the actual amount already
  // received against this invoice. Optional; defaults to 0 (nothing
  // received yet) when omitted.
  @ApiPropertyOptional({ example: 120000, description: 'Amount already received against this invoice' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  advanceReceived?: number;
}
