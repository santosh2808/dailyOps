import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

// Fixed set of reasons (section 5) — whitelisted so the stored
// rejectionReason is always one of these exact labels, never arbitrary
// free text (that's what `comment` is for).
export const REJECTION_REASONS = [
  'Price is high',
  'Requirements changed',
  'Project postponed',
  'Selected another supplier',
  'Other',
] as const;

export class RejectPublicQuotationDto {
  @ApiProperty({ enum: REJECTION_REASONS, example: 'Price is high' })
  @IsIn(REJECTION_REASONS)
  reason: (typeof REJECTION_REASONS)[number];

  @ApiPropertyOptional({ example: 'We found a better price elsewhere.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
