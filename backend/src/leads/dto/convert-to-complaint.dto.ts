import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ConvertToComplaintDto {
  @ApiPropertyOptional({ example: 'This is actually a warranty issue, not a sales opportunity' })
  @IsOptional()
  @IsString()
  reason?: string;
}
