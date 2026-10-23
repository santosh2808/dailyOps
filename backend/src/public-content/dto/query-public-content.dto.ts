import { ApiPropertyOptional } from '@nestjs/swagger';
import { ContentPostType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { BLOG_CATEGORIES, CASE_STUDY_INDUSTRIES } from '../../content/content.constants';

export class QueryPublicContentDto {
  @ApiPropertyOptional({ enum: ContentPostType })
  @IsOptional()
  @IsEnum(ContentPostType)
  type?: ContentPostType;

  @ApiPropertyOptional({ enum: BLOG_CATEGORIES, description: 'Blogs only' })
  @IsOptional()
  @IsIn(BLOG_CATEGORIES)
  category?: string;

  @ApiPropertyOptional({ enum: CASE_STUDY_INDUSTRIES, description: 'Case studies only' })
  @IsOptional()
  @IsIn(CASE_STUDY_INDUSTRIES)
  industry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  featured?: boolean;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 12, default: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 12;
}
