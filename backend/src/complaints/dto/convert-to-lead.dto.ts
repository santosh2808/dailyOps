import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ConvertToLeadDto {
  @ApiPropertyOptional({ example: 'Customer actually wants a new quotation, not a warranty repair' })
  @IsOptional()
  @IsString()
  reason?: string;
}
