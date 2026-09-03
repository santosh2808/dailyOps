import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

// Mirrors send-tax-invoice.dto.ts / send-proforma-invoice.dto.ts's shape —
// lets the sender override the recipient/CC for this (re)send only.
// Defaults to FACTORY_NOTIFICATION_EMAIL (the env-configured Production
// Team address) rather than a customer email, since a JEO is an internal
// document.
export class SendJeoDto {
  @ApiPropertyOptional({ description: 'Defaults to FACTORY_NOTIFICATION_EMAIL if omitted' })
  @IsOptional()
  @IsEmail()
  recipientEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ccEmails?: string;
}
