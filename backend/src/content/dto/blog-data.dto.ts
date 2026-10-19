import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  BLOG_BYLINE_MAX_LENGTH,
  BLOG_CATEGORIES,
  BLOG_TAG_MAX_LENGTH,
  BLOG_TAGS_MAX,
  EXCERPT_MAX_LENGTH,
} from '../content.constants';
import { ContentImageDto } from './content-image.dto';

// Blog template data
export class BlogDataDto {
  @ApiPropertyOptional({ description: 'Summary shown on the card. Required to publish.' })
  @IsOptional()
  @IsString()
  @MaxLength(EXCERPT_MAX_LENGTH, { message: `Summary must be ${EXCERPT_MAX_LENGTH} characters or fewer` })
  excerpt?: string;

  @ApiPropertyOptional({ type: ContentImageDto, description: 'Required to publish, with a description' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContentImageDto)
  coverImage?: ContentImageDto;

  @ApiPropertyOptional({ enum: BLOG_CATEGORIES, description: 'Required to publish' })
  @IsOptional()
  @IsIn(BLOG_CATEGORIES, { message: `Category must be one of: ${BLOG_CATEGORIES.join(', ')}` })
  category?: string;

  @ApiPropertyOptional({ example: ['hvls', 'warehouse cooling'], description: 'Lowercased and de-duplicated on save' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(BLOG_TAGS_MAX, { message: `At most ${BLOG_TAGS_MAX} tags` })
  @IsString({ each: true })
  @MaxLength(BLOG_TAG_MAX_LENGTH, { each: true, message: `Each tag must be ${BLOG_TAG_MAX_LENGTH} characters or fewer` })
  @Matches(/^[a-z0-9][a-z0-9 &-]*$/, { each: true, message: 'Tags may only use letters, numbers, spaces, "&" and "-"' })
  tags?: string[];

  @ApiPropertyOptional({ example: 'Spyro Fans Team', description: 'Byline shown on the post; defaults to "Spyro Fans Team"' })
  @IsOptional()
  @IsString()
  @MaxLength(BLOG_BYLINE_MAX_LENGTH, { message: `Byline must be ${BLOG_BYLINE_MAX_LENGTH} characters or fewer` })
  byline?: string;

  @ApiPropertyOptional({ description: 'Article as the editor JSON document. Required to publish.' })
  @IsOptional()
  @IsObject({ message: 'Article must be an editor document' })
  body?: Record<string, unknown>;

  @ApiPropertyOptional({ type: ContentImageDto, description: 'Link-preview image; defaults to the cover image' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContentImageDto)
  ogImage?: ContentImageDto;

  @ApiPropertyOptional({ example: '2026-10-15', description: 'Date shown on the post (YYYY-MM-DD); defaults to the first publish day' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date must be YYYY-MM-DD' })
  @IsISO8601({ strict: true }, { message: 'Date must be a real calendar date' })
  date?: string;
}
