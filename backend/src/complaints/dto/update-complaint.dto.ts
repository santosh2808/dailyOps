import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

// salesOrderId is immutable after creation (a complaint doesn't get
// re-pointed at a different order) — this deliberately does NOT extend
// CreateComplaintDto, so that field can never sneak in here.
export class UpdateComplaintDto {
  @ApiPropertyOptional({ example: 'Fan making unusual noise after installation' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Subject cannot be blank' })
  subject?: string;

  @ApiPropertyOptional({ example: 'Customer reports a rattling sound within a week of dispatch.' })
  @IsOptional()
  @IsString()
  description?: string;
}
