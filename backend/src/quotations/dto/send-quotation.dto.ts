import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class SendQuotationDto {
  @ApiPropertyOptional({ description: 'Defaults to the customer\'s email on file if omitted' })
  @IsOptional()
  @IsEmail()
  recipientEmail?: string;

  @ApiPropertyOptional({ example: 'sales.manager@smartrotamac.com' })
  @IsOptional()
  @IsString()
  ccEmails?: string;
}
