import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

// Annexure-I "Scope of Supply | Technical Specifications" row set for a
// given fan size/model — see the Product.technicalSpec schema comment for
// why this is one flexible JSON blob rather than ~25 flat columns. Every
// field is optional free text (the PDF just renders a blank cell for
// anything left empty) except scopeOfSupply, which is a repeatable list.
export interface ProductTechnicalSpec {
  modelNo?: string;
  fanSize?: string;
  noOfBlades?: string;
  airVolume?: string;
  coverageArea?: string;
  motorRating?: string;
  speed?: string;
  noise?: string;
  weight?: string;
  threePhaseVoltage?: string;
  threePhaseCurrent?: string;
  onePhaseVoltage?: string;
  onePhaseCurrent?: string;
  frequency?: string;
  frameStructure?: string;
  hangingStructure?: string;
  fasteners?: string;
  bladeDesign?: string;
  bladeMoc?: string;
  bladeSectionalWidth?: string;
  driveType?: string;
  controlPanelMounting?: string;
  controlPanelDrive?: string;
  controlPanelEnclosure?: string;
  bmsCompatibility?: string;
  safetyCertification?: string;
  boltedJoints?: string;
  warrantyMotor?: string;
  warrantyDrive?: string;
  warrantyOther?: string;
  scopeOfSupply?: { item: string; quantityPerFan: string }[];
}

export class CreateProductDto {
  @ApiProperty({ example: 'HVLS Fan - 24ft' })
  @IsString()
  @IsNotEmpty({ message: 'Product name is required' })
  name: string;

  @ApiProperty({ example: 'HVLS Fans' })
  @IsString()
  @IsNotEmpty({ message: 'Category is required' })
  category: string;

  @ApiPropertyOptional({ example: 'SR-HVLS-24' })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({ example: 'High volume, low speed industrial ceiling fan.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 125000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Price must be a positive number' })
  price?: number;

  // Additive: Sales Automation price validation (requirement #8). All three
  // optional — a product with none of these set is simply never subject to
  // the Quotation price-validation gate (see QuotationsService).
  @ApiPropertyOptional({ example: 125000, description: 'List/catalog price used as the 0% discount baseline' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Standard price must be a positive number' })
  standardPrice?: number;

  @ApiPropertyOptional({ example: 100000, description: 'Selling below this price blocks Quotation approval' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Minimum price must be a positive number' })
  minPrice?: number;

  @ApiPropertyOptional({ example: 15, description: 'Discount % above which the Approval Matrix escalates' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Maximum discount % must be a positive number' })
  maxDiscountPercent?: number;

  // Additive: Techno-Commercial Offer PDF — see ProductTechnicalSpec above
  // and the Product.technicalSpec schema comment.
  @ApiPropertyOptional({ description: 'Annexure-I technical specification sheet for this fan size/model' })
  @IsOptional()
  @IsObject()
  technicalSpec?: ProductTechnicalSpec;
}
