import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

// Reported by the browser when a user copies/cuts text or prints on a Leads
// screen — see LeadAccessService. leadId is omitted for the Leads list.
export class LeadAccessEventDto {
  @ApiProperty({ enum: ['COPY', 'PRINT'] })
  @IsIn(['COPY', 'PRINT'])
  type!: 'COPY' | 'PRINT';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @ApiPropertyOptional({ description: 'Number of characters copied' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  chars?: number;

  @ApiPropertyOptional({ example: 'Leads list' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  page?: string;
}
