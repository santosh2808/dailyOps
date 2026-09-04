import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEmail, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

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
