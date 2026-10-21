import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
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

// Save working copy
export class UpdateContentPostDto {
  @ApiProperty({ example: 3 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Title cannot be blank' })
  @MaxLength(TITLE_MAX_LENGTH, { message: `Title must be ${TITLE_MAX_LENGTH} characters or fewer` })
  title?: string;

  @ApiPropertyOptional({ description: 'Website (uuid). Can only change while the post is not published' })
  @IsOptional()
  @IsUUID()
  formWebsiteId?: string;

  @ApiPropertyOptional({ description: 'Can only change while the post is not published' })
  @IsOptional()
  @IsString()
  @MaxLength(SLUG_MAX_LENGTH, { message: `URL name must be ${SLUG_MAX_LENGTH} characters or fewer` })
  @Matches(SLUG_PATTERN, { message: 'URL name can only use lowercase letters, numbers and single hyphens' })
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @ApiPropertyOptional({ description: 'Send an empty string to clear' })
  @IsOptional()
  @IsString()
  @MaxLength(SEO_TITLE_MAX_LENGTH, { message: `Google title must be ${SEO_TITLE_MAX_LENGTH} characters or fewer` })
  seoTitle?: string;

  @ApiPropertyOptional({ description: 'Send an empty string to clear' })
  @IsOptional()
  @IsString()
  @MaxLength(SEO_DESCRIPTION_MAX_LENGTH, { message: `Google description must be ${SEO_DESCRIPTION_MAX_LENGTH} characters or fewer` })
  seoDescription?: string;

  @ApiPropertyOptional({ description: 'Template fields — replaces the stored data' })
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [ContentPostProductDto], description: 'Case studies only — replaces the stored list' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CASE_STUDY_PRODUCTS_MAX, { message: `At most ${CASE_STUDY_PRODUCTS_MAX} products` })
  @ValidateNested({ each: true })
  @Type(() => ContentPostProductDto)
  products?: ContentPostProductDto[];
}
