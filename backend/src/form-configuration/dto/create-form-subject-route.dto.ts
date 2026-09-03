import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FormDestinationType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

// subjectCode is validated as any non-empty string, not restricted to
// CANONICAL_SUBJECT_CODES — a future website is explicitly allowed to
// introduce its own code (plan §4); the canonical list is only ever used as
// a UI convenience default, never enforced server-side here.
export class CreateFormSubjectRouteDto {
  @ApiProperty({ example: 'GENERAL_ENQUIRY' })
  @IsString()
  @IsNotEmpty({ message: 'Subject code is required' })
  subjectCode: string;

  @ApiProperty({ example: 'General Enquiry' })
  @IsString()
  @IsNotEmpty({ message: 'Subject label is required' })
  subjectLabel: string;

  @ApiProperty({ enum: FormDestinationType })
  @IsEnum(FormDestinationType)
  destinationType: FormDestinationType;

  @ApiPropertyOptional({ description: 'Restrict this route to one product; omit to apply to any/no product' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @ApiPropertyOptional({ example: 0, default: 0, description: 'Higher priority wins when more than one enabled route matches' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
