import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

// Deliberately loose (no @IsNotEmpty/@IsEmail/@IsEnum here) — this DTO only
// describes the on-the-wire shape of a row coming back from the Preview
// step and being sent to the commit endpoint. The actual business-rule
// validation (required fields, email/phone format, known enum values)
// happens in LeadsService's classifyImportRow(), which needs to classify a
// bad row as "invalid" and keep going with the rest of the batch — a
// decorator failure here would reject the whole request instead.
export class ImportLeadRowDto {
  @ApiPropertyOptional({ description: 'Original row number from the uploaded file, for traceability' })
  @IsOptional()
  @IsInt()
  row?: number;

  @ApiPropertyOptional({ example: 'Acme Corp' })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  contactPerson?: string;

  @ApiPropertyOptional({ example: 'john@acme.com' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'Pune' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Maharashtra' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: 'Manufacturing' })
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional({ example: 'WEBSITE', description: 'Matched case-insensitively against LeadSource' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ example: 'NEW', description: 'Matched case-insensitively against LeadStatus' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'Met at trade show' })
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiPropertyOptional({ example: 'Telangana', description: 'Workbook tab this row came from, for traceability in multi-sheet imports' })
  @IsOptional()
  @IsString()
  sheet?: string;
}
