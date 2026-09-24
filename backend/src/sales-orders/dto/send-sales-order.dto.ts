import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

// QA bug fix (SC-007): mirrors proforma-invoices/dto/send-proforma-invoice.dto.ts's
// shape exactly — lets the sender override the recipient/CC for this send only.
export class SendSalesOrderDto {
  @ApiPropertyOptional({ description: "Defaults to the customer's email on file if omitted" })
  @IsOptional()
  @IsEmail()
  recipientEmail?: string;

  @ApiPropertyOptional({ example: 'finance@smartrotamac.com' })
  @IsOptional()
  @IsString()
  ccEmails?: string;
}
