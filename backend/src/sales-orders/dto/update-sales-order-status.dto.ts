import { ApiProperty } from '@nestjs/swagger';
import { SalesOrderStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

// Override Approval workflow: the old dispatchOverrideApprovedBy /
// dispatchOverrideNote self-declare fields have been removed from this DTO.
// Moving to READY_FOR_DISPATCH / DISPATCHED with advance received below the
// 50% threshold no longer accepts an inline override from the request body
// at all — SalesOrdersService.updateStatus() instead raises a real
// OverrideApprovalRequest and blocks (throws) until Santosh Kumar Chegondi
// or Amarpal Gampa approves it via an emailed public link. See
// ApprovalRequestsService / ApprovalDecisionsService.
export class UpdateSalesOrderStatusDto {
  @ApiProperty({ enum: SalesOrderStatus, example: SalesOrderStatus.CONFIRMED })
  @IsEnum(SalesOrderStatus)
  status: SalesOrderStatus;
}
