import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
} from 'class-validator';
import { INDIA_STATES } from '../../common/india-states';
import { normalizePhoneForValidation } from '../../common/phone.util';

export class CreateCustomerDto {
  @ApiProperty({ example: 'Acme Corp' })
  @IsString()
  @IsNotEmpty({ message: 'Company name is required' })
  companyName: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty({ message: 'Contact person is required' })
  contactPerson: string;

  // QA bug-fix pass, Group B (TC-083/097): same normalize-before-validate
  // treatment as Lead's phone/alternatePhone (see CreateLeadDto) — a
  // customer's number pasted as "+91 98765 43210" now normalizes down to
  // the bare digits instead of being rejected by this regex outright.
  @ApiProperty({ example: '9876543210' })
  @Transform(({ value }) => normalizePhoneForValidation(value))
  @IsString()
  @Matches(/^\d{10,15}$/, { message: 'Phone must be 10-15 digits' })
  phone: string;

  @ApiPropertyOptional({ example: 'john@acme.com' })
  @IsOptional()
  @IsEmail({}, { message: 'Email must be a valid email address' })
  email?: string;

  // Business rule: GST number is mandatory for GST-registered (B2B)
  // customers, optional for unregistered/retail (B2C) ones — hence the
  // `isGstRegistered` flag gating the requirement below rather than making
  // gstNumber unconditionally required.
  @ApiPropertyOptional({ example: true, description: 'Whether this customer is GST-registered (B2B)' })
  @IsOptional()
  @IsBoolean()
  isGstRegistered?: boolean;

  @ApiPropertyOptional({ example: '27ABCDE1234F1Z5' })
  @ValidateIf((o) => o.isGstRegistered === true)
  @IsNotEmpty({ message: 'GST number is required for GST-registered customers' })
  @IsString()
  gstNumber?: string;

  // Required — every customer needs a state so it always contributes to the
  // Dashboard's India Sales Map (see IndiaSalesMap.tsx / dashboard.service.ts
  // byState aggregation). The column itself stays nullable so the handful of
  // customers created before this was enforced don't need a forced backfill.
  @ApiProperty({ example: 'Maharashtra', enum: INDIA_STATES })
  @IsIn(INDIA_STATES, { message: 'State is required' })
  state: string;
}
