import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { JeoPriority } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateJeoDto {
  @ApiProperty({ description: 'Id (uuid) of the existing Sales Order to generate this JEO from' })
  @IsUUID()
  salesOrderId: string;

  @ApiPropertyOptional({ enum: JeoPriority, default: JeoPriority.MEDIUM })
  @IsOptional()
  @IsEnum(JeoPriority)
  priority?: JeoPriority;

  @ApiPropertyOptional({ example: 'Rahul (Production)' })
  @IsOptional()
  @IsString()
  assignedTo?: string;

  @ApiPropertyOptional({ example: 'Customer requested early dispatch if possible.' })
  @IsOptional()
  @IsString()
  remarks?: string;
}
