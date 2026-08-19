import { ApiProperty } from '@nestjs/swagger';
import { ProformaInvoiceStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateProformaInvoiceStatusDto {
  @ApiProperty({ enum: ProformaInvoiceStatus, example: ProformaInvoiceStatus.SENT })
  @IsEnum(ProformaInvoiceStatus)
  status: ProformaInvoiceStatus;
}
