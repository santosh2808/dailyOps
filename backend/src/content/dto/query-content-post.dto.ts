import { ApiPropertyOptional } from '@nestjs/swagger';
import { ContentPostStatus, ContentPostType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { BLOG_CATEGORIES, CASE_STUDY_INDUSTRIES, CONTENT_POST_SORTS, type ContentPostSort } from '../content.constants';

export class QueryContentPostDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'FormWebsite id (uuid)' })
  @IsOptional()
  @IsUUID()
  formWebsiteId?: string;

  @ApiPropertyOptional({ enum: ContentPostType })
  @IsOptional()
  @IsEnum(ContentPostType)
  type?: ContentPostType;

  @ApiPropertyOptional({ enum: ContentPostStatus, description: 'Omit for drafts + published (archived hidden)' })
  @IsOptional()
  @IsEnum(ContentPostStatus)
  status?: ContentPostStatus;

  @ApiPropertyOptional({ description: 'Live posts with unpublished edits' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  hasUnpublishedChanges?: boolean;

  @ApiPropertyOptional({ example: 'hvls', description: 'Matches title or URL name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: BLOG_CATEGORIES })
  @IsOptional()
  @IsIn(BLOG_CATEGORIES)
  category?: string;

  @ApiPropertyOptional({ enum: CASE_STUDY_INDUSTRIES })
  @IsOptional()
  @IsIn(CASE_STUDY_INDUSTRIES)
  industry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  featured?: boolean;

  @ApiPropertyOptional({ enum: CONTENT_POST_SORTS, default: 'updated_desc' })
  @IsOptional()
  @IsIn(CONTENT_POST_SORTS, { message: `sort must be one of: ${CONTENT_POST_SORTS.join(', ')}` })
  sort?: ContentPostSort = 'updated_desc';
}
