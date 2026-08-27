import { ApiProperty } from '@nestjs/swagger';
import { TaxInvoiceStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateTaxInvoiceStatusDto {
  @ApiProperty({ enum: TaxInvoiceStatus, example: TaxInvoiceStatus.SENT })
  @IsEnum(TaxInvoiceStatus)
  status: TaxInvoiceStatus;
}
