import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { ImportLeadRowDto } from './import-lead-row.dto';

export class ImportLeadsDto {
  @ApiProperty({ type: [ImportLeadRowDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one row is required' })
  @ValidateNested({ each: true })
  @Type(() => ImportLeadRowDto)
  rows: ImportLeadRowDto[];
}
