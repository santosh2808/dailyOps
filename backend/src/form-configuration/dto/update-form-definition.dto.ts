import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

// code and publicFormKey are immutable after creation — a form's public key
// must never change once a website may already be embedding it.
export class UpdateFormDefinitionDto {
  @ApiPropertyOptional({ example: 'Contact Form' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Name cannot be blank' })
  name?: string;

  @ApiPropertyOptional({ description: 'Disabling a form makes its publicFormKey reject new submissions' })
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
