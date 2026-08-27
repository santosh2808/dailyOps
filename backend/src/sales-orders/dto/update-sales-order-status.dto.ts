import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SalesOrderStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateSalesOrderStatusDto {
  @ApiProperty({ enum: SalesOrderStatus, example: SalesOrderStatus.CONFIRMED })
  @IsEnum(SalesOrderStatus)
  status: SalesOrderStatus;

  // Dispatch gate (advance-payment check) — only required/used when moving
  // to READY_FOR_DISPATCH or DISPATCHED without an advance payment recorded
  // on the linked Proforma Invoice yet. See SalesOrdersService.updateStatus()
  // for the actual gate. Ignored for every other status transition.
  @ApiPropertyOptional({
    example: 'Customer confirmed payment on delivery — dispatching without advance per Sales Manager approval.',
    description:
      'Required only to override the advance-payment dispatch block. Recorded against the Sales Order.',
  })
  @IsOptional()
  @IsString()
  dispatchOverrideNote?: string;
}
