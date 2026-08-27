import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

// GST e-invoicing (IRN + QR) details, entered manually after being obtained
// from the government e-invoice portal or GSP — see schema.prisma comment
// on TaxInvoice.irn. All optional/independently updatable so the QR image
// can be pasted in first and the IRN filled in afterward, or vice versa.
export class UpdateTaxInvoiceEInvoiceDto {
  @ApiPropertyOptional({ description: 'Invoice Reference Number issued by the GST e-invoice portal' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  irn?: string;

  @ApiPropertyOptional({ description: 'Acknowledgement number returned alongside the IRN' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ackNumber?: string;

  @ApiPropertyOptional({ description: 'Acknowledgement date returned alongside the IRN' })
  @IsOptional()
  @IsDateString()
  ackDate?: string;

  @ApiPropertyOptional({
    description:
      'Government-issued QR code image as a base64 data string (with or without the data: URL prefix)',
  })
  @IsOptional()
  @IsString()
  qrCodeImage?: string;
}
