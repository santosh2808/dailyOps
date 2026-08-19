import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

// Deliberately loose (no @IsNotEmpty/@IsEmail here) — this DTO only
// describes the on-the-wire shape of a row coming back from the Preview
// step and being sent to the commit endpoint. The actual business-rule
// validation (Supplier Name required, email/phone/lead time format) happens
// in SuppliersService's classifyImportRow(), which needs to classify a bad
// row as "invalid" and keep going with the rest of the batch — a decorator
// failure here would reject the whole request instead. Same convention as
// Lead Import's ImportLeadRowDto.
export class ImportSupplierRowDto {
  @ApiPropertyOptional({ description: 'Original row number from the uploaded file, for traceability' })
  @IsOptional()
  @IsInt()
  row?: number;

  @ApiPropertyOptional({ example: 'Tata Steel Ltd.' })
  @IsOptional()
  @IsString()
  supplierName?: string;

  @ApiPropertyOptional({ example: '27AAACT2727Q1ZW' })
  @IsOptional()
  @IsString()
  gstNumber?: string;

  @ApiPropertyOptional({ example: 'AAACT2727Q' })
  @IsOptional()
  @IsString()
  panNumber?: string;

  @ApiPropertyOptional({ example: 'Ramesh Kumar' })
  @IsOptional()
  @IsString()
  contactPerson?: string;

  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'purchase@tatasteel.com' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: 'https://www.tatasteel.com' })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional({ example: 'Plot 12, MIDC Industrial Area' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Pune' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Maharashtra' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: 'India' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: '411019' })
  @IsOptional()
  @IsString()
  pinCode?: string;

  @ApiPropertyOptional({ example: 'Net 30' })
  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @ApiPropertyOptional({ example: '7' })
  @IsOptional()
  @IsString()
  leadTime?: string;

  @ApiPropertyOptional({ example: 'INR' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 'Preferred supplier for raw steel' })
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiPropertyOptional({ example: 'ACTIVE', description: 'Matched case-insensitively against SupplierStatus' })
  @IsOptional()
  @IsString()
  status?: string;
}
