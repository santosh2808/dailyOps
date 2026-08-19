import { ApiPropertyOptional } from '@nestjs/swagger';
import { JeoPriority, JeoStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class QueryJeoDto {
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
    example: 'acme',
    description: "Matches JEO number, sales order number, or the linked customer's company name / contact person",
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: JeoStatus })
  @IsOptional()
  @IsEnum(JeoStatus)
  status?: JeoStatus;

  @ApiPropertyOptional({ enum: JeoPriority })
  @IsOptional()
  @IsEnum(JeoPriority)
  priority?: JeoPriority;

  @ApiPropertyOptional({ description: 'Filter by customer id (uuid)' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Filter by the originating sales order id (uuid)' })
  @IsOptional()
  @IsUUID()
  salesOrderId?: string;

  @ApiPropertyOptional({ example: '2026-01-01', description: 'deliveryDate >= dateFrom' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'deliveryDate <= dateTo' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({
    example: 'createdAt',
    enum: ['createdAt', 'updatedAt', 'jeoNumber', 'deliveryDate', 'priority', 'status'],
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ example: 'desc', enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
