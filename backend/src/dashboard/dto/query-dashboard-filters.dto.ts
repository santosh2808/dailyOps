import { ApiPropertyOptional } from '@nestjs/swagger';
import { LeadSource } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

// Additive: Dashboard Redesign v2 — Global Filters (requirement #13).
// Shared by /dashboard/sales-by-state, /dashboard/top-products, and
// /dashboard/executives — the three summary widgets that don't already
// have their own date control (unlike /dashboard/revenue, which keeps its
// own period/month/year — see dashboard.controller.ts for why those two
// aren't merged). All optional; every field narrows results only when
// present, same as every other query DTO in this backend.
export class QueryDashboardFiltersDto {
  @ApiPropertyOptional({ example: 8, minimum: 1, maximum: 12, description: 'Restricts to this calendar month (needs year too)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @ApiPropertyOptional({ example: 2026 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({ example: 'Maharashtra', description: "Filter by the linked customer's state" })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: 'Priya Sharma', description: "Filter by the order's createdBy name" })
  @IsOptional()
  @IsString()
  executive?: string;

  @ApiPropertyOptional({ enum: LeadSource, description: 'Best-effort: only matches orders whose Quotation traces back to a Lead with this source — direct customer quotations (no Lead) are excluded when this filter is set' })
  @IsOptional()
  @IsEnum(LeadSource)
  leadSource?: LeadSource;

  @ApiPropertyOptional({ description: 'Restrict to orders containing this product (uuid)' })
  @IsOptional()
  @IsUUID()
  productId?: string;
}
