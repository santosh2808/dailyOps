import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeadPriority, LeadSource, PreferredLanguage } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { INDIA_STATES } from '../../common/india-states';
import { normalizePhoneForValidation } from '../../common/phone.util';
import { LeadProductInputDto } from './lead-product-input.dto';

// Indian mobile numbers are exactly 10 digits — previously accepted 10-15,
// which let obviously-wrong 11-15 digit entries through the backend even
// though the message said "10-15 digits" (see TC-037).
const PHONE_REGEX = /^\d{10}$/;

export class CreateLeadDto {
  // No longer mandatory — some leads (e.g. an individual homeowner, or an
  // early-stage inquiry with no company confirmed yet) genuinely have no
  // company name to give. Lead.companyName stays a NOT NULL column (see
  // schema.prisma), so LeadsService.create()/update() default this to ''
  // when omitted rather than requiring a migration to make the column
  // nullable — same fallback pattern createFromPublicForm() already uses.
  @ApiPropertyOptional({ example: 'Acme Corp' })
  @IsOptional()
  @IsString()
  companyName?: string;

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

  // QA bug-fix pass, Group B (TC-083/097): normalized before validation, so
  // "+91 98765 43210" / "+91-9876543210" / "09876543210" all pass and get
  // stored as the canonical bare 10 digits — same tolerance already used by
  // whatsapp/normalize-phone.ts, just applied here at entry time instead of
  // only when sending a WhatsApp message.
  @ApiProperty({ example: '9876543210' })
  @Transform(({ value }) => normalizePhoneForValidation(value))
  @IsString()
  @Matches(PHONE_REGEX, { message: 'Phone must be exactly 10 digits' })
  phone: string;

  @ApiPropertyOptional({ example: '9123456780' })
  @IsOptional()
  @Transform(({ value }) => normalizePhoneForValidation(value))
  @Matches(PHONE_REGEX, { message: 'Alternate phone must be exactly 10 digits' })
  alternatePhone?: string;

  @ApiPropertyOptional({ example: 'Pune' })
  @IsOptional()
  @IsString()
  city?: string;

  // Required (requirement: "make state mandatory so it always shows on the
  // Dashboard's India Sales Map") — validated against the same INDIA_STATES
  // list Customer.state uses so a value copied over on conversion (see
  // LeadsService.convertToCustomer()) always matches the map's key list.
  @ApiProperty({ example: 'Maharashtra', enum: INDIA_STATES })
  @IsIn(INDIA_STATES, { message: 'State is required' })
  state: string;

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
  // Required — every lead must be owned by someone. The column itself stays
  // nullable (Lead.assignedToUserId uses onDelete: SetNull, which Prisma
  // requires to be nullable) so a lead never blocks the delete of the user
  // it's assigned to; it just falls back to unassigned in that one case.
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsUUID(undefined, { message: 'Assigning this lead to a user is required' })
  assignedToUserId: string;

  // D.O.T. AI Lead Assistant Phase 1: an explicit choice here always wins
  // over the state-based default LeadsService would otherwise compute (see
  // common/state-language-defaults.ts) — e.g. set by a future public
  // lead-capture form that asks the customer directly, or by a salesperson
  // who already knows the customer's preference. Left unset on most leads
  // created via the ordinary form today; LeadsService.create() derives a
  // default from `state` whenever this is omitted.
  @ApiPropertyOptional({ enum: PreferredLanguage })
  @IsOptional()
  @IsEnum(PreferredLanguage)
  preferredLanguage?: PreferredLanguage;

  // Lead re-engagement: optionally link this brand-new Lead back to an
  // older Lost lead it's a re-engagement of — purely for traceability, the
  // old lead itself stays exactly as closed as it was (see
  // LeadsService.create()'s validation, which requires the referenced lead
  // to actually be LOST). Set only here, at creation; UpdateLeadDto strips
  // it back out so it can never be changed afterward — see
  // LeadsService.update().
  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsOptional()
  @IsUUID(undefined, { message: 'previousLeadId must be a valid lead id' })
  previousLeadId?: string;
}
