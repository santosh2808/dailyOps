import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateMaterialCategoryDto {
  @ApiProperty({ example: 'Raw Steel' })
  @IsString()
  @IsNotEmpty({ message: 'Category name is required' })
  name: string;

  @ApiPropertyOptional({ example: 'Structural and sheet steel stock' })
  @IsOptional()
  @IsString()
  description?: string;
}
