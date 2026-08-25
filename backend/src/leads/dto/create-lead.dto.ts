import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeadPriority, LeadSource } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { LeadProductInputDto } from './lead-product-input.dto';

const PHONE_REGEX = /^\d{10,15}$/;

export class CreateLeadDto {
  @ApiProperty({ example: 'Acme Corp' })
  @IsString()
  @IsNotEmpty({ message: 'Company name is required' })
  companyName: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty({ message: 'Contact person is required' })
  contactPerson: string;

  @ApiPropertyOptional({ example: 'Facilities Manager' })
  @IsOptional()
  @IsString()
  designation?: string;

  @ApiPropertyOptional({ example: 'john@acme.com' })
  @IsOptional()
  @IsEmail({}, { message: 'Email must be a valid email address' })
  email?: string;

  @ApiProperty({ example: '9876543210' })
  @IsString()
  @Matches(PHONE_REGEX, { message: 'Phone must be 10-15 digits' })
  phone: string;

  @ApiPropertyOptional({ example: '9123456780' })
  @IsOptional()
  @Matches(PHONE_REGEX, { message: 'Alternate phone must be 10-15 digits' })
  alternatePhone?: string;

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

  @ApiPropertyOptional({ example: 'Manufacturing' })
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiProperty({ example: 'HVLS fans for new warehouse' })
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  title: string;

  @ApiPropertyOptional({ example: 'Client is expanding their warehouse and needs 6 HVLS fans.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [LeadProductInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LeadProductInputDto)
  products?: LeadProductInputDto[];

  @ApiPropertyOptional({ example: 250000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Estimated value must be a positive number' })
  estimatedValue?: number;

  @ApiPropertyOptional({ enum: LeadPriority, default: LeadPriority.MEDIUM })
  @IsOptional()
  @IsEnum(LeadPriority)
  priority?: LeadPriority;

  @ApiPropertyOptional({ enum: LeadSource, default: LeadSource.OTHER })
  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  expectedCloseDate?: string;

  @ApiPropertyOptional({ example: '2026-08-05' })
  @IsOptional()
  @IsDateString()
  nextFollowUp?: string;

  // Lead Management Phase 1 (requirement #5) — short free-text reminder
  // alongside the follow-up date, e.g. "Call before 3pm".
  @ApiPropertyOptional({ example: 'Call before 3pm' })
  @IsOptional()
  @IsString()
  reminderNote?: string;

  @ApiPropertyOptional({ example: 'Interested but needs board approval' })
  @IsOptional()
  @IsString()
  remarks?: string;

  // Lead Assignment enhancement: a real FK to User, restricted client-side
  // to Sales Executive / Sales Manager users (see UsersService.findAssignable()).
  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsOptional()
  @IsUUID(undefined, { message: 'A valid user is required' })
  assignedToUserId?: string;
}
