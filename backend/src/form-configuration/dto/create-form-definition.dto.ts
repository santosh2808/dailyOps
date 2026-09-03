import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

// publicFormKey is deliberately absent — always server-generated (a random,
// non-guessable key), same rationale as CreateComplaintDto omitting
// complaintNumber. enabled defaults to true (see FormConfigurationService.createForm).
export class CreateFormDefinitionDto {
  @ApiProperty({ example: 'CONTACT_FORM', description: 'Stable code, unique within the parent website' })
  @IsString()
  @IsNotEmpty({ message: 'Code is required' })
  code: string;

  @ApiProperty({ example: 'Contact Form' })
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ example: 'info@spyro.com' })
  @IsOptional()
  @IsEmail()
  supportEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  configuration?: Record<string, unknown>;
}
