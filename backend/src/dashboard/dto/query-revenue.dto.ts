import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

// Additive: Dashboard Redesign — Revenue chart (requirement #4).
export class QueryRevenueDto {
  @ApiPropertyOptional({
    example: 'monthly',
    enum: ['weekly', 'monthly', 'quarterly', 'yearly'],
    default: 'monthly',
  })
  @IsOptional()
  @IsIn(['weekly', 'monthly', 'quarterly', 'yearly'])
  period?: 'weekly' | 'monthly' | 'quarterly' | 'yearly' = 'monthly';

  // Only used by period=weekly; defaults to the current month.
  @ApiPropertyOptional({ example: 8, minimum: 1, maximum: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  // Used by period=weekly/monthly/quarterly; defaults to the current year.
  // period=yearly ignores this and always shows the 5 years ending here.
  @ApiPropertyOptional({ example: 2026 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;
}
