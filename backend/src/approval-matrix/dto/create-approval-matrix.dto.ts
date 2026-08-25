import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateApprovalMatrixDto {
  @ApiProperty({ example: 'Quotation', description: 'Module this bracket applies to' })
  @IsString()
  module: string;

  @ApiProperty({ example: 0, description: 'Inclusive lower bound of the discount % bracket' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPercent: number;

  @ApiProperty({ example: 5, description: 'Exclusive upper bound of the discount % bracket' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPercent: number;

  @ApiProperty({ description: 'Role id (uuid) required to approve within this bracket' })
  @IsUUID()
  requiredRoleId: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
