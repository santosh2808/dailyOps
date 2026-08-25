import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RequestQuotationApprovalDto {
  @ApiPropertyOptional({ example: 'Customer is a long-term strategic account.' })
  @IsOptional()
  @IsString()
  reason?: string;
}
