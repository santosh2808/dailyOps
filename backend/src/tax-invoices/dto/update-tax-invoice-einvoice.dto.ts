import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, Matches, MaxLength, Validate, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

// A real IRN is a 64-character hex SHA-256 hash. Empty string is allowed so
// the field can still be cleared.
const IRN_PATTERN = /^([a-fA-F0-9]{64})?$/;

const MAX_QR_BYTES = 1024 * 1024;

// QR must be a PNG or JPEG image (checked by magic bytes, not just the
// declared MIME type) of reasonable size. Empty string allowed to clear.
@ValidatorConstraint({ name: 'isQrImage', async: false })
class IsQrImageConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    if (value === '' || value === undefined || value === null) return true;
    if (typeof value !== 'string') return false;
    const base64 = value.replace(/^data:image\/[a-zA-Z+.-]+;base64,/, '');
    if (!/^[A-Za-z0-9+/=\s]+$/.test(base64)) return false;
    const buf = Buffer.from(base64, 'base64');
    if (buf.length === 0 || buf.length > MAX_QR_BYTES) return false;
    const isPng = buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const isJpeg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    return isPng || isJpeg;
  }
  defaultMessage() {
    return 'QR code must be a valid PNG or JPEG image no larger than 1 MB';
  }
}

// GST e-invoicing (IRN + QR) details, entered manually after being obtained
// from the government e-invoice portal or GSP — see schema.prisma comment
// on TaxInvoice.irn. All optional/independently updatable so the QR image
// can be pasted in first and the IRN filled in afterward, or vice versa.
export class UpdateTaxInvoiceEInvoiceDto {
  @ApiPropertyOptional({ description: 'Invoice Reference Number issued by the GST e-invoice portal' })
  @IsOptional()
  @IsString()
  @Matches(IRN_PATTERN, { message: 'IRN must be a 64-character hexadecimal code issued by the e-invoice portal' })
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
  @Validate(IsQrImageConstraint)
  qrCodeImage?: string;
}
