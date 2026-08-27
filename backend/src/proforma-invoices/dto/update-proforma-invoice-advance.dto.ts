import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

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
}
