import { ApiPropertyOptional } from '@nestjs/swagger';
import { ComplaintSource, ComplaintStatus, WarrantyVerificationStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

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

  // Bug fix (TC-057): "Essential filters missing in the complaints list" —
  // the filter bar only had search + status; add the same shape of filters
  // the Leads list filter bar already has (assignedTo, source, date range),
  // plus a few Complaint-specific ones (department, website, category,
  // warranty verification status).
  @ApiPropertyOptional({
    description:
      'Filter by assigned user id (uuid), or the literal string "unassigned" for complaints with no assignee',
  })
  @IsOptional()
  @IsString()
  assignedToUserId?: string;

  @ApiPropertyOptional({ description: 'Filter by assigned department id (uuid)' })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ enum: ComplaintSource })
  @IsOptional()
  @IsEnum(ComplaintSource)
  source?: ComplaintSource;

  @ApiPropertyOptional({ description: 'Filter by the originating public-form website id (uuid)' })
  @IsOptional()
  @IsUUID()
  sourceWebsiteId?: string;

  @ApiPropertyOptional({
    description:
      'Filter by the originating public-form "category" (its subject code, e.g. COMPLAINT, GENERAL_ENQUIRY)',
  })
  @IsOptional()
  @IsString()
  sourceSubjectCode?: string;

  @ApiPropertyOptional({ enum: WarrantyVerificationStatus })
  @IsOptional()
  @IsEnum(WarrantyVerificationStatus)
  warrantyVerificationStatus?: WarrantyVerificationStatus;

  @ApiPropertyOptional({ example: '2026-01-01', description: 'createdAt >= dateFrom' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'createdAt <= dateTo' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

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
