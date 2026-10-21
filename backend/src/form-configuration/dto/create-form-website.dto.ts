import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEmail, IsNotEmpty, IsObject, IsOptional, IsString, Matches } from 'class-validator';

// HTTPS site URL
export const SITE_URL_PATTERN =
  /^(https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}|http:\/\/(localhost|127\.0\.0\.1))(:\d{1,5})?(\/[^\s?#]*[^\s?#/])?$/i;
export const SITE_URL_MESSAGE = 'Site address must be an https:// URL without a trailing slash, e.g. https://www.spyrofans.com';

// status is deliberately absent here — every website starts ACTIVE; use
// PATCH /:id to deactivate one, same convention as CreateComplaintDto
// omitting `status`.
export class CreateFormWebsiteDto {
  @ApiProperty({ example: 'PRODUCT_A', description: 'Stable machine code, unique across websites' })
  @IsString()
  @IsNotEmpty({ message: 'Code is required' })
  code: string;

  @ApiProperty({ example: 'SPYRO' })
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  name: string;

  @ApiPropertyOptional({ example: 'info@spyro.com' })
  @IsOptional()
  @IsEmail()
  supportEmail?: string;

  @ApiPropertyOptional({ example: 'https://www.spyrofans.com', description: 'Public site address, for "View on website" links' })
  @IsOptional()
  @Matches(SITE_URL_PATTERN, { message: SITE_URL_MESSAGE })
  siteUrl?: string;

  @ApiPropertyOptional({
    example: ['https://spyro.com'],
    description: 'Origins allowed to call the public submission endpoint from a browser',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedOrigins?: string[];

  @ApiPropertyOptional({ description: 'Free-form configuration blob (branding, defaults, etc.)' })
  @IsOptional()
  @IsObject()
  configuration?: Record<string, unknown>;
}
