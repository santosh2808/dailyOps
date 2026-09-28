import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

// Dispatch gate (advance-payment check) + "generate Tax Invoice" both read
// ProformaInvoice.advanceReceived — this is the one place that value can be
// updated after the invoice is first generated (see schema.prisma comment
// on ProformaInvoice.advanceReceived). Deliberately an absolute amount, not
// an incremental "add a payment" delta — simplest option, matching how
// every other snapshotted amount on this model is edited.
//
// Override Approval workflow: the old advanceOverrideApprovedBy /
// advanceOverrideNote self-declare fields have been removed from this DTO.
// Recording an amount below the required minimum no longer accepts an
// inline override from the request body at all —
// ProformaInvoicesService.updateAdvance() instead raises a real
// OverrideApprovalRequest and blocks (throws) until Santosh Kumar Chegondi
// or Amarpal Gampa approves it via an emailed public link.
export class UpdateProformaInvoiceAdvanceDto {
  @ApiProperty({ example: 59000, description: 'Total amount received so far against this invoice' })
  @IsNumber()
  @Min(0)
  advanceReceived: number;
}
