import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { HangingStructureType, JeoPriority } from '@prisma/client';
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

  // Scope of Work — see the JobExecutionOrder.pipeLength/hangingStructureType/
  // color schema comments. All optional/site-specific, collected once here
  // at generation time (no edit endpoint exists for a JEO afterward).
  @ApiPropertyOptional({ example: '12 ft', description: 'Pipe length used to hang the fan at site' })
  @IsOptional()
  @IsString()
  pipeLength?: string;

  @ApiPropertyOptional({ enum: HangingStructureType, description: 'How the fan is hung at site' })
  @IsOptional()
  @IsEnum(HangingStructureType)
  hangingStructureType?: HangingStructureType;

  @ApiPropertyOptional({ example: 'Aluminium', description: 'Fan colour/finish — defaults to Aluminium when left blank' })
  @IsOptional()
  @IsString()
  color?: string;
}
