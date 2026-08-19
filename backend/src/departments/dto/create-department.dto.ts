import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateDepartmentDto {
  @ApiProperty({ example: 'Sales' })
  @IsString()
  @IsNotEmpty({ message: 'Department name is required' })
  name: string;

  @ApiPropertyOptional({ example: 'Handles leads, quotations, and sales orders' })
  @IsOptional()
  @IsString()
  description?: string;
}
