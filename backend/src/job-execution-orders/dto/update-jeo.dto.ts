import { ApiPropertyOptional } from '@nestjs/swagger';
import { HangingStructureType, JeoPriority } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

// Bug-fix requirement: staff must be able to correct a JEO's details even
// after the factory notification has already gone out — this module
// previously had NO edit endpoint at all (see CreateJeoDto's own comment:
// "no edit endpoint exists for a JEO afterward"). That was fine as long as
// mistakes were impossible to make, but they aren't, so this DTO now
// exists. salesOrderId (and everything copied from it — customer,
// quotation, delivery date) stays fixed at generation time; only the
// fields the manual "Generate JEO" dialog itself collects are editable.
export class UpdateJeoDto {
  @ApiPropertyOptional({ enum: JeoPriority })
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

  @ApiPropertyOptional({ example: '12 ft' })
  @IsOptional()
  @IsString()
  pipeLength?: string;

  @ApiPropertyOptional({ enum: HangingStructureType })
  @IsOptional()
  @IsEnum(HangingStructureType)
  hangingStructureType?: HangingStructureType;

  @ApiPropertyOptional({ example: 'Aluminium' })
  @IsOptional()
  @IsString()
  color?: string;
}
