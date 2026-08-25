import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

// Techno-Commercial Offer PDF — Annexure-II commercial terms (see
// QuotationPdfService.QuotationCommercialTerms, which this mirrors field
// for field). Every field is optional free text; anything left unset falls
// back to QuotationPdfService's DEFAULT_COMMERCIAL_TERMS when the PDF is
// rendered. `unloading`/`installationSchedule` are the two lines that only
// some real quotations have at all, so they're omitted from the PDF
// entirely rather than falling back to a default.
export class QuotationCommercialTermsDto {
  @ApiPropertyOptional({ example: 'NCR', description: 'Optional region/branch code inserted into the quotation reference number (e.g. SR|NCR|SPYRO|QTN|1|2026)' })
  @IsOptional()
  @IsString()
  regionCode?: string;

  @ApiPropertyOptional({ example: 'Ex-Works, Hyderabad' })
  @IsOptional()
  @IsString()
  priceBasis?: string;

  @ApiPropertyOptional({ example: 'Included', description: 'Annexure-I "Installation" price-schedule row' })
  @IsOptional()
  @IsString()
  installationCharge?: string;

  @ApiPropertyOptional({ example: 'Extra at actual' })
  @IsOptional()
  @IsString()
  transportation?: string;

  @ApiPropertyOptional({ example: 'Included', description: '"Included" or "Extra" — rendered as e.g. "GST 18% Included"' })
  @IsOptional()
  @IsString()
  gstTerms?: string;

  @ApiPropertyOptional({ example: 'Included' })
  @IsOptional()
  @IsString()
  packingForwarding?: string;

  @ApiPropertyOptional({ example: 'To your account' })
  @IsOptional()
  @IsString()
  transportInsurance?: string;

  @ApiPropertyOptional({ example: 'Customer scope', description: 'Optional Annexure-II line — omitted from the PDF entirely if unset' })
  @IsOptional()
  @IsString()
  unloading?: string;

  @ApiPropertyOptional({ example: '100% advance along with the Purchase order.' })
  @IsOptional()
  @IsString()
  payment?: string;

  @ApiPropertyOptional({ example: '7-10 days from the date of PO / release of advance.' })
  @IsOptional()
  @IsString()
  delivery?: string;

  @ApiPropertyOptional({
    example: 'Can be taken place after confirmation of receipt of the fan at site, shall be arranged by our installation team within two working days.',
    description: 'Optional Annexure-II line — omitted from the PDF entirely if unset',
  })
  @IsOptional()
  @IsString()
  installationSchedule?: string;

  @ApiPropertyOptional({ example: '90 days from the date of offer' })
  @IsOptional()
  @IsString()
  offerValidity?: string;
}
