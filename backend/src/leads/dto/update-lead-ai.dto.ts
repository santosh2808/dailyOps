import { ApiPropertyOptional } from '@nestjs/swagger';
import { AiLeadStatus, AiQualification, LanguageSource, PreferredLanguage } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

// D.O.T. AI Lead Assistant Phase 1 — the only way AI-specific fields on a
// Lead are written directly (LeadAiCallLog-driven updates go through
// addAiCallLog() instead — see CreateLeadAiCallLogDto). Deliberately its
// own DTO/endpoint, separate from UpdateLeadDto (the human "Edit Lead"
// form): AI status/qualification must never be reachable through the
// ordinary Lead edit flow, and updating it here never touches Lead.status —
// the sales pipeline stage stays a fully separate, human-driven field.
export class UpdateLeadAiDto {
  @ApiPropertyOptional({ enum: AiLeadStatus })
  @IsOptional()
  @IsEnum(AiLeadStatus)
  aiStatus?: AiLeadStatus;

  @ApiPropertyOptional({ enum: AiQualification })
  @IsOptional()
  @IsEnum(AiQualification)
  aiQualification?: AiQualification;

  @ApiPropertyOptional({ example: 'Customer is interested in 8 HVLS fans for a warehouse in Hyderabad.' })
  @IsOptional()
  @IsString()
  aiSummary?: string;

  // An explicit value here always wins over LeadsService's state-based
  // default — see common/state-language-defaults.ts.
  @ApiPropertyOptional({ enum: PreferredLanguage })
  @IsOptional()
  @IsEnum(PreferredLanguage)
  preferredLanguage?: PreferredLanguage;

  @ApiPropertyOptional({ enum: LanguageSource })
  @IsOptional()
  @IsEnum(LanguageSource)
  languageSource?: LanguageSource;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  aiCallAttempts?: number;

  @ApiPropertyOptional({ example: '2026-09-10T11:32:00.000Z' })
  @IsOptional()
  @IsDateString()
  lastAiCallAt?: string;

  @ApiPropertyOptional({ example: '2026-09-12T11:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  nextAiCallAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  aiSiteVisitRequested?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  aiCallbackRequested?: boolean;

  @ApiPropertyOptional({ example: '2026-09-11T15:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  aiCallbackAt?: string;
}
