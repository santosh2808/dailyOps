import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateMaterialUnitDto {
  @ApiProperty({ example: 'Kilogram' })
  @IsString()
  @IsNotEmpty({ message: 'Unit name is required' })
  name: string;

  @ApiPropertyOptional({ example: 'Kg' })
  @IsOptional()
  @IsString()
  symbol?: string;
}
