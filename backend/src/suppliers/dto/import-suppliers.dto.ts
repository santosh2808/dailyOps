import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { ImportSupplierRowDto } from './import-supplier-row.dto';

export class ImportSuppliersDto {
  @ApiProperty({ type: [ImportSupplierRowDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one row is required' })
  @ValidateNested({ each: true })
  @Type(() => ImportSupplierRowDto)
  rows: ImportSupplierRowDto[];
}
