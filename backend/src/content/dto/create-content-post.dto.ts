import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContentPostType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  CASE_STUDY_PRODUCTS_MAX,
  SEO_DESCRIPTION_MAX_LENGTH,
  SEO_TITLE_MAX_LENGTH,
  SLUG_MAX_LENGTH,
  SLUG_PATTERN,
  TITLE_MAX_LENGTH,
} from '../content.constants';
import { ContentPostProductDto } from './content-post-product.dto';

// Create draft
export class CreateContentPostDto {
  @ApiProperty({ description: 'FormWebsite id (uuid) the post belongs to, e.g. SPYRO' })
  @IsUUID()
  formWebsiteId: string;

  @ApiProperty({ enum: ContentPostType })
  @IsEnum(ContentPostType)
  type: ContentPostType;

  @ApiProperty({ example: 'How to choose the right HVLS fan size' })
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  @MaxLength(TITLE_MAX_LENGTH, { message: `Title must be ${TITLE_MAX_LENGTH} characters or fewer` })
  title: string;

  @ApiProperty({ example: 'choosing-hvls-fan-size', description: 'URL name, unique per website' })
  @IsString()
  @MaxLength(SLUG_MAX_LENGTH, { message: `URL name must be ${SLUG_MAX_LENGTH} characters or fewer` })
  @Matches(SLUG_PATTERN, { message: 'URL name can only use lowercase letters, numbers and single hyphens' })
  slug: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @ApiPropertyOptional({ description: 'Defaults to the title' })
  @IsOptional()
  @IsString()
  @MaxLength(SEO_TITLE_MAX_LENGTH, { message: `Google title must be ${SEO_TITLE_MAX_LENGTH} characters or fewer` })
  seoTitle?: string;

  @ApiPropertyOptional({ description: 'Defaults to the summary' })
  @IsOptional()
  @IsString()
  @MaxLength(SEO_DESCRIPTION_MAX_LENGTH, { message: `Google description must be ${SEO_DESCRIPTION_MAX_LENGTH} characters or fewer` })
  seoDescription?: string;

  @ApiPropertyOptional({ description: 'Template fields — see BlogDataDto / CaseStudyDataDto' })
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [ContentPostProductDto], description: 'Case studies only: products used' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CASE_STUDY_PRODUCTS_MAX, { message: `At most ${CASE_STUDY_PRODUCTS_MAX} products` })
  @ValidateNested({ each: true })
  @Type(() => ContentPostProductDto)
  products?: ContentPostProductDto[];
}
