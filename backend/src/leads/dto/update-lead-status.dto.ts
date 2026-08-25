import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { LeadStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateLeadStatusDto {
  @ApiProperty({ enum: LeadStatus, example: LeadStatus.CONTACTED })
  @IsEnum(LeadStatus)
  status: LeadStatus;

  // Additive: recorded on the new LeadStatusHistory row (and folded into the
  // LeadHistory timeline entry) when this status change is saved. Optional
  // so existing callers that don't send it keep working unchanged.
  @ApiPropertyOptional({ example: 'Customer asked for more time to review the quote' })
  @IsOptional()
  @IsString()
  remarks?: string;
}
