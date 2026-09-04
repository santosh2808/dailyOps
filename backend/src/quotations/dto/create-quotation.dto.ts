import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuotationStatus, TransportScope } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
import { QuotationCommercialTermsDto } from './quotation-commercial-terms.dto';

export class CreateQuotationDto {
  // Lead Management Phase 1 (requirement #8): exactly one of customerId /
  // leadId must be provided — enforced in QuotationsService.create(), not
  // here, since class-validator has no clean "exactly one of" decorator.
  // When leadId is given, items are derived from the Lead's own linked
  // products rather than accepted from the request body (see the service),
  // so `items` below is optional rather than required.
  @ApiPropertyOptional({ description: 'Customer id (uuid) — omit when creating from a Lead' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Lead id (uuid) — "Generate Quotation" from a Qualified Lead' })
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @ApiPropertyOptional({ enum: QuotationStatus, default: QuotationStatus.DRAFT })
  @IsOptional()
  @IsEnum(QuotationStatus)
  status?: QuotationStatus;

  @ApiPropertyOptional({ type: [QuotationItemInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'A quotation needs at least one item' })
  @ValidateNested({ each: true })
  @Type(() => QuotationItemInputDto)
  items?: QuotationItemInputDto[];

  @ApiPropertyOptional({ example: 18, default: 18, description: 'GST percentage applied to the subtotal' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'GST percent must be a positive number' })
  gstPercent?: number;

  // Real currency amounts feeding into grandTotal (not just Annexure-II
  // descriptive text). If omitted, installationCharge is auto-computed by
  // QuotationsService as Rs.8,000 x total fan quantity; send an explicit
  // value only to override that rate for a specific quotation.
  // transportationCharge has no default — it varies by site/distance, so
  // staff fill it in per quotation (defaults to 0 until set).
  @ApiPropertyOptional({ example: 16000, description: 'Installation charge — defaults to Rs.8,000 x total quantity if omitted' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Installation charge must be a positive number' })
  installationCharge?: number;

  @ApiPropertyOptional({ example: 4500, description: 'Transportation charge — varies by site/distance, no default' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Transportation charge must be a positive number' })
  transportationCharge?: number;

  // Additive: who arranges/pays for transport. Defaults to COMPANY_SCOPE
  // (today's only behavior). When CUSTOMER_SCOPE, transportationCharge is
  // forced to 0 in QuotationsService.computeTotals() regardless of what's
  // sent here — the customer arranges their own transport.
  @ApiPropertyOptional({ enum: TransportScope, default: TransportScope.COMPANY_SCOPE })
  @IsOptional()
  @IsEnum(TransportScope)
  transportScope?: TransportScope;

  // Additive: set when staff confirm that a quotation item's price already
  // has installation/transportation/GST baked in (prompted by the frontend
  // when a unit price is raised above the product's base price). When true,
  // QuotationsService.computeTotals() stops adding installation/
  // transportation/GST on top of the subtotal.
  @ApiPropertyOptional({ default: false, description: 'True when item prices already include installation/transportation/GST' })
  @IsOptional()
  @IsBoolean()
  pricesIncludeChargesAndGst?: boolean;

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

  // Techno-Commercial Offer PDF (branded Quotation template) — Annexure-II
  // commercial terms. Optional: a quotation with this unset renders the
  // PDF with QuotationPdfService's sensible defaults. regionCode (if set)
  // is consumed at creation time by QuotationsService.generateQuotationNumber().
  @ApiPropertyOptional({ type: QuotationCommercialTermsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => QuotationCommercialTermsDto)
  commercialTerms?: QuotationCommercialTermsDto;
}
