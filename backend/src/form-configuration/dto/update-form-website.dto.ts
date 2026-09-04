import { ApiPropertyOptional } from '@nestjs/swagger';
import { FormWebsiteStatus } from '@prisma/client';
import { IsArray, IsEmail, IsEnum, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

// code is immutable after creation (a website's public_form_key-adjacent
// identity shouldn't silently change) — this deliberately does NOT extend
// CreateFormWebsiteDto, same convention as UpdateComplaintDto.
export class UpdateFormWebsiteDto {
  @ApiPropertyOptional({ example: 'SPYRO' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Name cannot be blank' })
  name?: string;

  @ApiPropertyOptional({ enum: FormWebsiteStatus })
  @IsOptional()
  @IsEnum(FormWebsiteStatus)
  status?: FormWebsiteStatus;

  @ApiPropertyOptional({ example: 'info@spyro.com' })
  @IsOptional()
  @IsEmail()
  supportEmail?: string;

  @ApiPropertyOptional({ example: ['https://spyro.com'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedOrigins?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  configuration?: Record<string, unknown>;
}
