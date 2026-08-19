import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateMaterialDto {
  @ApiProperty({ example: 'RM-STL-001', description: 'Must be unique' })
  @IsString()
  @IsNotEmpty({ message: 'Material code is required' })
  materialCode: string;

  @ApiProperty({ example: 'Mild Steel Sheet 2mm' })
  @IsString()
  @IsNotEmpty({ message: 'Material name is required' })
  name: string;

  @ApiPropertyOptional({ example: '2mm gauge, 4x8 ft sheet' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsUUID(undefined, { message: 'A valid category is required' })
  categoryId: string;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567891' })
  @IsUUID(undefined, { message: 'A valid unit is required' })
  unitId: string;

  // Plain scalar, not a real relation — no Supplier module exists yet.
  // Same convention as Lead.assignedTo / SalesOrder.createdBy.
  @ApiPropertyOptional({ example: 'Tata Steel Ltd.' })
  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiPropertyOptional({ example: 450 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Cost cannot be negative' })
  cost?: number;

  @ApiPropertyOptional({ example: 10, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0, { message: 'Minimum stock cannot be negative' })
  minimumStock?: number = 0;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0, { message: 'Maximum stock cannot be negative' })
  maximumStock?: number;

  @ApiPropertyOptional({ example: 25, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0, { message: 'Reorder level cannot be negative' })
  reorderLevel?: number = 0;

  @ApiPropertyOptional({ example: 100, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0, { message: 'Current stock cannot be negative' })
  currentStock?: number = 0;

  // Plain scalar, not a real relation — no Warehouse module exists yet.
  @ApiPropertyOptional({ example: 'Warehouse A - Rack 3' })
  @IsOptional()
  @IsString()
  warehouseId?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}
