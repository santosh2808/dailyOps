import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export const QUOTATION_APPROVAL_PURPOSES = ['ACCEPT', 'SEND'] as const;
export type QuotationApprovalPurpose = (typeof QUOTATION_APPROVAL_PURPOSES)[number];

export class RequestQuotationApprovalDto {
  @ApiPropertyOptional({ example: 'Customer is a long-term strategic account.' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    enum: QUOTATION_APPROVAL_PURPOSES,
    default: 'ACCEPT',
    description: 'ACCEPT: approve and accept internally. SEND: approve the pricing so it can be sent to the customer.',
  })
  @IsOptional()
  @IsIn(QUOTATION_APPROVAL_PURPOSES)
  purpose?: QuotationApprovalPurpose;
}
