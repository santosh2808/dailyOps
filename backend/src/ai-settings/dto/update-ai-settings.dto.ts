import { ApiPropertyOptional } from '@nestjs/swagger';
import { PreferredLanguage } from '@prisma/client';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

// D.O.T. AI Lead Assistant Phase 1 — foundation-only settings. Nothing in
// this codebase reads aiCallingEnabled/callNewMarketingLeadsEnabled to
// trigger a call yet; they exist only as switches for Phase 2's calling
// engine to check. Editing any field here never places a call, sends an
// SMS/WhatsApp message, or contacts a customer by itself.
export class UpdateAiSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  aiCallingEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  callNewMarketingLeadsEnabled?: boolean;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxCallAttempts?: number;

  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @IsString()
  @Matches(TIME_REGEX, { message: 'callingHoursStart must be HH:mm (24-hour)' })
  callingHoursStart?: string;

  @ApiPropertyOptional({ example: '18:00' })
  @IsOptional()
  @IsString()
  @Matches(TIME_REGEX, { message: 'callingHoursEnd must be HH:mm (24-hour)' })
  callingHoursEnd?: string;

  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @IsInt()
  @Min(0)
  defaultDelayMinutes?: number;

  @ApiPropertyOptional({ enum: PreferredLanguage, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(PreferredLanguage, { each: true })
  supportedLanguages?: PreferredLanguage[];
}
