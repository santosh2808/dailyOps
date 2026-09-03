import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

// Bug-fix requirement: staff must be able to correct a Proforma Invoice's
// printed details even after it's already been sent — sendInvoice() (see
// proforma-invoices.service.ts) has never blocked resending once generated
// (only CANCELLED blocks it), so an edit followed by a resend is the
// intended fix-a-mistake flow. salesOrderId/invoiceNumber/amounts and
// advanceReceived (its own dedicated /advance endpoint) are deliberately
// not editable here.
export class UpdateProformaInvoiceDto {
  @ApiPropertyOptional({ example: '2026-08-02' })
  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @ApiPropertyOptional({ example: '50% advance, balance before dispatch' })
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
