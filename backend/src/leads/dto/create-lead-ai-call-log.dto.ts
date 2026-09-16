import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AiLeadStatus, AiQualification, PreferredLanguage } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { INDIA_STATES } from '../../common/india-states';

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

  // Phase 3A — the structured requirement Meera collects during the call.
  // Rolled up onto Lead.quantity/application/timeline (see addAiCallLog())
  // and also kept here as a per-call snapshot, same treatment as
  // qualification/summary above. Never touches Lead.status.
  @ApiPropertyOptional({ example: 5, description: 'Number of HVLS fans discussed on this call.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({ example: 'Manufacturing warehouse' })
  @IsOptional()
  @IsString()
  application?: string;

  @ApiPropertyOptional({ example: 'Within 30 days' })
  @IsOptional()
  @IsString()
  timeline?: string;

  // city/state reuse the existing Lead.city/Lead.state columns (no
  // duplicate fields) — see CreateLeadDto for the same INDIA_STATES
  // validation on state. Optional here: only overwrites the Lead's
  // existing value when the AI call actually reports one.
  @ApiPropertyOptional({ example: 'Hyderabad' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Telangana', enum: INDIA_STATES })
  @IsOptional()
  @IsIn(INDIA_STATES)
  state?: string;

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
