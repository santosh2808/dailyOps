import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SalesOrderStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { DISPATCH_OVERRIDE_APPROVERS } from '../dispatch-override-approvers';

export class UpdateSalesOrderStatusDto {
  @ApiProperty({ enum: SalesOrderStatus, example: SalesOrderStatus.CONFIRMED })
  @IsEnum(SalesOrderStatus)
  status: SalesOrderStatus;

  // Dispatch gate (50% advance-payment check) — only required/used when
  // moving to READY_FOR_DISPATCH or DISPATCHED with advance received below
  // 50% of the order total. See SalesOrdersService.updateStatus() for the
  // actual gate (which also requires the acting user to hold the
  // Administrator role). Ignored for every other status transition.
  @ApiPropertyOptional({
    enum: DISPATCH_OVERRIDE_APPROVERS,
    description:
      'Required only to override the 50%-advance dispatch block. Must be one of the two fixed approvers; the acting user must also be an Administrator.',
  })
  @IsOptional()
  @IsIn(DISPATCH_OVERRIDE_APPROVERS)
  dispatchOverrideApprovedBy?: string;

  @ApiPropertyOptional({
    example: 'Customer confirmed payment on delivery — dispatching per Sales Manager approval.',
    description: 'Optional context for the dispatch override. Recorded against the Sales Order.',
  })
  @IsOptional()
  @IsString()
  dispatchOverrideNote?: string;
}
