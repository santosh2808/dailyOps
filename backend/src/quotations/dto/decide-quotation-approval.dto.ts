import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class DecideQuotationApprovalDto {
  @ApiProperty({ description: 'true = approve (and accept the quotation), false = reject' })
  @IsBoolean()
  approve: boolean;

  @ApiPropertyOptional({ example: 'Approved given the order volume.' })
  @IsOptional()
  @IsString()
  remarks?: string;
}
