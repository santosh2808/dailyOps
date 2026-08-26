import { ApiPropertyOptional } from '@nestjs/swagger';
import { ComplaintStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class QueryComplaintDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({
    example: 'noise',
    description: 'Matches complaint number, subject, sales order number, or the linked customer\'s company name',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ComplaintStatus })
  @IsOptional()
  @IsEnum(ComplaintStatus)
  status?: ComplaintStatus;

  @ApiPropertyOptional({ description: 'Filter by the linked Sales Order id (uuid)' })
  @IsOptional()
  @IsUUID()
  salesOrderId?: string;

  @ApiPropertyOptional({
    example: 'createdAt',
    enum: ['createdAt', 'updatedAt', 'complaintNumber', 'status'],
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ example: 'desc', enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
