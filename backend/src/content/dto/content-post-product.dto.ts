import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsUUID, Max, Min } from 'class-validator';
import { CASE_STUDY_PRODUCT_QUANTITY_MAX } from '../content.constants';

// Product used
export class ContentPostProductDto {
  @ApiProperty({ description: 'FormWebsiteProduct id (uuid) — must belong to the post\'s website and be enabled' })
  @IsUUID()
  formWebsiteProductId: string;

  @ApiProperty({ example: 8 })
  @Type(() => Number)
  @IsInt({ message: 'Quantity must be a whole number' })
  @Min(1, { message: 'Quantity must be at least 1' })
  @Max(CASE_STUDY_PRODUCT_QUANTITY_MAX, { message: `Quantity must be at most ${CASE_STUDY_PRODUCT_QUANTITY_MAX}` })
  quantity: number;
}
