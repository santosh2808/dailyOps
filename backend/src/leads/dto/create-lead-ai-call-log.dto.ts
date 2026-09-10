import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AiLeadStatus, AiQualification, PreferredLanguage } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

// Records one D.O.T. call attempt against a lead. In Phase 1 this is only
// ever invoked manually — via Administration/Lead Details as a dev/test
// mechanism (no telephony provider is integrated yet, see Step 14/16/17 of
// the feature spec) — nothing in this codebase calls it automatically.
// Phase 2's calling engine is expected to call the equivalent internal
// endpoint once a real call completes, populating externalCallId/
// transcriptRef/recordingRef from the provider's own response; those three
// fields are reserved here for that, unused by anything in Phase 1.
export class CreateLeadAiCallLogDto {
  @ApiProperty({ enum: AiLeadStatus })
  @IsEnum(AiLeadStatus)
  status: AiLeadStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalCallId?: string;

  @ApiPropertyOptional({ example: '2026-09-10T11:28:00.000Z' })
  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @ApiPropertyOptional({ example: '2026-09-10T11:31:18.000Z' })
  @IsOptional()
  @IsDateString()
  endedAt?: string;

  @ApiPropertyOptional({ example: 198 })
  @IsOptional()
  @IsInt()
  @Min(0)
  durationSeconds?: number;

  // Reported here as the language the call was actually conducted in —
  // always taken as an explicit customer signal (languageSource ends up
  // AI_DETECTED on the Lead), never overridden by the state default.
  @ApiPropertyOptional({ enum: PreferredLanguage })
  @IsOptional()
  @IsEnum(PreferredLanguage)
  language?: PreferredLanguage;

  @ApiPropertyOptional({ enum: AiQualification })
  @IsOptional()
  @IsEnum(AiQualification)
  qualification?: AiQualification;

  @ApiPropertyOptional({
    example: 'Customer is interested in 8 HVLS fans for a warehouse in Hyderabad and requested a site visit.',
  })
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiPropertyOptional({ description: 'Reference only (e.g. a provider-hosted URL/ID) — never the raw transcript.' })
  @IsOptional()
  @IsString()
  transcriptRef?: string;

  @ApiPropertyOptional({ description: 'Reference only (e.g. a provider-hosted URL/ID) — never the raw audio.' })
  @IsOptional()
  @IsString()
  recordingRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  siteVisitRequested?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  callbackRequested?: boolean;

  @ApiPropertyOptional({ example: '2026-09-11T15:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  callbackAt?: string;
}
