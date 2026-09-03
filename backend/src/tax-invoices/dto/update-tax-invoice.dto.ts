import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Bug-fix requirement: staff must be able to correct a Tax Invoice's printed
// details (buyer's order no., destination, terms of delivery, etc.) even
// after it's already been sent — sendInvoice() has never blocked resending
// (see its own comment: "Blocked once cancelled — there's nothing left to
// send"), so an edit followed by a resend is the intended fix-a-mistake
// flow. salesOrderId/invoiceNumber/grandTotal and the e-invoice fields
// (updateEInvoiceDetails()) are deliberately not editable here — they're
// either fixed at generation time or have their own dedicated endpoint.
export class UpdateTaxInvoiceDto {
  @ApiPropertyOptional({ example: '2026-08-27' })
  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @ApiPropertyOptional({ example: 'PO-12345' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: "Buyer's Order No. is required" })
  buyersOrderNo?: string;

  @ApiPropertyOptional({ example: 'By Road' })
  @IsOptional()
  @IsString()
  dispatchedThrough?: string;

  @ApiPropertyOptional({ example: 'Hyderabad' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Destination is required' })
  destination?: string;

  @ApiPropertyOptional({ example: 'Packing: Inclusive\nInstallation: Inclusive\nFreight: Inclusive' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Terms of Delivery is required' })
  termsOfDelivery?: string;
}
