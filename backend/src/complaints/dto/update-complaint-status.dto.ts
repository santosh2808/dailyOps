import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ComplaintStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateComplaintStatusDto {
  @ApiProperty({ enum: ComplaintStatus, example: ComplaintStatus.RESOLVED })
  @IsEnum(ComplaintStatus)
  status: ComplaintStatus;

  // Typically filled in when moving to RESOLVED/CLOSED, but not enforced —
  // some complaints resolve themselves via a status change alone (e.g.
  // logged in error).
  @ApiPropertyOptional({ example: 'Replacement unit dispatched free of cost; customer confirmed satisfaction.' })
  @IsOptional()
  @IsString()
  resolutionNotes?: string;
}
