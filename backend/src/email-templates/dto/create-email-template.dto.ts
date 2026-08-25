import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateEmailTemplateDto {
  @ApiProperty({ example: 'QUOTATION', description: 'Stable lookup key used by MailerService' })
  @IsString()
  key: string;

  @ApiProperty({ example: 'Quotation Email' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Quotation {{quotationNumber}} from Smart Rotamac' })
  @IsString()
  subject: string;

  @ApiProperty({ example: '<p>Dear {{customerName}},</p><p>Please find attached...</p>' })
  @IsString()
  bodyHtml: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
