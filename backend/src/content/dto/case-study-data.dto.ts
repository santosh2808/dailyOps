import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CASE_STUDY_AREA_SQFT_MAX,
  CASE_STUDY_GALLERY_MAX,
  CASE_STUDY_INDUSTRIES,
  CASE_STUDY_KEY_RESULTS_MAX,
  CASE_STUDY_TEXT_MAX_LENGTH,
  EXCERPT_MAX_LENGTH,
} from '../content.constants';
import { ContentImageDto } from './content-image.dto';

export class CaseStudyKeyResultDto {
  @ApiProperty({ example: '8°C' })
  @IsString()
  @IsNotEmpty({ message: 'Key result value is required' })
  @MaxLength(20, { message: 'Key result value must be 20 characters or fewer' })
  value: string;

  @ApiProperty({ example: 'cooler on the shop floor' })
  @IsString()
  @IsNotEmpty({ message: 'Key result label is required' })
  @MaxLength(60, { message: 'Key result label must be 60 characters or fewer' })
  label: string;
}

export class CaseStudyQuoteDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Quote text is required' })
  @MaxLength(500, { message: 'Quote must be 500 characters or fewer' })
  text: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Name of the person quoted is required' })
  @MaxLength(80, { message: 'Name must be 80 characters or fewer' })
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80, { message: 'Designation must be 80 characters or fewer' })
  designation?: string;
}

// Case study data
export class CaseStudyDataDto {
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

  @ApiPropertyOptional({ example: 'Sri Lakshmi Textiles' })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Client name must be 100 characters or fewer' })
  clientName?: string;

  @ApiPropertyOptional({ example: 'A leading textile mill', description: 'Shown instead of a client name' })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Anonymous label must be 100 characters or fewer' })
  anonymousClientLabel?: string;

  @ApiPropertyOptional({ type: ContentImageDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContentImageDto)
  clientLogo?: ContentImageDto;

  @ApiPropertyOptional({ enum: CASE_STUDY_INDUSTRIES, description: 'Required to publish' })
  @IsOptional()
  @IsIn(CASE_STUDY_INDUSTRIES, { message: `Industry must be one of: ${CASE_STUDY_INDUSTRIES.join(', ')}` })
  industry?: string;

  @ApiPropertyOptional({ example: 'Cold storage', description: 'Industry name when industry is Other (then required to publish)' })
  @IsOptional()
  @IsString()
  @MaxLength(60, { message: 'Industry name must be 60 characters or fewer' })
  industryOther?: string;

  @ApiPropertyOptional({ example: 'Hyderabad', description: 'Required to publish' })
  @IsOptional()
  @IsString()
  @MaxLength(60, { message: 'City must be 60 characters or fewer' })
  city?: string;

  @ApiPropertyOptional({ example: 'Telangana', description: 'Required to publish' })
  @IsOptional()
  @IsString()
  @MaxLength(60, { message: 'State must be 60 characters or fewer' })
  state?: string;

  @ApiPropertyOptional({ example: 40000 })
  @IsOptional()
  @IsInt({ message: 'Area must be a whole number of square feet' })
  @Min(1, { message: 'Area must be at least 1 sq ft' })
  @Max(CASE_STUDY_AREA_SQFT_MAX, { message: `Area must be at most ${CASE_STUDY_AREA_SQFT_MAX} sq ft` })
  areaSqFt?: number;

  @ApiPropertyOptional({ type: [CaseStudyKeyResultDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CASE_STUDY_KEY_RESULTS_MAX, { message: `At most ${CASE_STUDY_KEY_RESULTS_MAX} key results` })
  @ValidateNested({ each: true })
  @Type(() => CaseStudyKeyResultDto)
  keyResults?: CaseStudyKeyResultDto[];

  @ApiPropertyOptional({ description: 'Plain text; blank lines separate paragraphs. Required to publish.' })
  @IsOptional()
  @IsString()
  @MaxLength(CASE_STUDY_TEXT_MAX_LENGTH, { message: `The challenge must be ${CASE_STUDY_TEXT_MAX_LENGTH} characters or fewer` })
  challenge?: string;

  @ApiPropertyOptional({ description: 'Plain text. Required to publish.' })
  @IsOptional()
  @IsString()
  @MaxLength(CASE_STUDY_TEXT_MAX_LENGTH, { message: `The solution must be ${CASE_STUDY_TEXT_MAX_LENGTH} characters or fewer` })
  solution?: string;

  @ApiPropertyOptional({ description: 'Plain text. Required to publish.' })
  @IsOptional()
  @IsString()
  @MaxLength(CASE_STUDY_TEXT_MAX_LENGTH, { message: `The results must be ${CASE_STUDY_TEXT_MAX_LENGTH} characters or fewer` })
  results?: string;

  @ApiPropertyOptional({ type: CaseStudyQuoteDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CaseStudyQuoteDto)
  quote?: CaseStudyQuoteDto;

  @ApiPropertyOptional({ type: [ContentImageDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CASE_STUDY_GALLERY_MAX, { message: `At most ${CASE_STUDY_GALLERY_MAX} project photos` })
  @ValidateNested({ each: true })
  @Type(() => ContentImageDto)
  gallery?: ContentImageDto[];

  @ApiPropertyOptional({ example: 'https://www.youtube.com/watch?v=abc123', description: 'YouTube or Vimeo only' })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'Video link must be an https:// YouTube or Vimeo address' })
  videoUrl?: string;

  @ApiPropertyOptional({ example: '2026-08-31', description: 'Project completed date (YYYY-MM-DD)' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Completed date must be YYYY-MM-DD' })
  @IsISO8601({ strict: true }, { message: 'Completed date must be a real calendar date' })
  completedAt?: string;
}
