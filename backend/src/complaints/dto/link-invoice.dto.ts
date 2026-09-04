import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class LinkInvoiceDto {
  @ApiProperty({ description: 'The TaxInvoice (id, uuid) to link to this complaint' })
  @IsUUID()
  taxInvoiceId: string;

  @ApiPropertyOptional({ description: 'The specific TaxInvoiceItem (id, uuid) the claim concerns — must belong to taxInvoiceId' })
  @IsOptional()
  @IsUUID()
  taxInvoiceItemId?: string;
}
