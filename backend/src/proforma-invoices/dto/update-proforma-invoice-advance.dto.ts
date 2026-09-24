import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { DISPATCH_OVERRIDE_APPROVERS } from '../../sales-orders/dispatch-override-approvers';

// Dispatch gate (advance-payment check) + "generate Tax Invoice" both read
// ProformaInvoice.advanceReceived — this is the one place that value can be
// updated after the invoice is first generated (see schema.prisma comment
// on ProformaInvoice.advanceReceived). Deliberately an absolute amount, not
// an incremental "add a payment" delta — simplest option, matching how
// every other snapshotted amount on this model is edited.
export class UpdateProformaInvoiceAdvanceDto {
  @ApiProperty({ example: 59000, description: 'Total amount received so far against this invoice' })
  @IsNumber()
  @Min(0)
  advanceReceived: number;

  // QA feature (SC-011): minimum-advance gate (MINIMUM_ADVANCE_PERCENT% of
  // the linked Sales Order's grandTotal) — only required/used when
  // advanceReceived is below that minimum. See
  // ProformaInvoicesService.updateAdvance() for the actual gate (which also
  // requires the acting user to hold the Administrator role). Same shape as
  // UpdateSalesOrderStatusDto's dispatchOverrideApprovedBy/dispatchOverrideNote.
  @ApiPropertyOptional({
    enum: DISPATCH_OVERRIDE_APPROVERS,
    description:
      'Required only to record an advance below the required minimum. Must be one of the two fixed approvers; the acting user must also be an Administrator.',
  })
  @IsOptional()
  @IsIn(DISPATCH_OVERRIDE_APPROVERS)
  advanceOverrideApprovedBy?: string;

  @ApiPropertyOptional({
    example: 'Customer will pay the balance on delivery — accepted per Sales Manager approval.',
    description: 'Optional context for the below-minimum override. Recorded against the invoice.',
  })
  @IsOptional()
  @IsString()
  advanceOverrideNote?: string;
}
