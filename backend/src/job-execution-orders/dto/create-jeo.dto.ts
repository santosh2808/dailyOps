import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { HangingStructureType, JeoPriority } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { DISPATCH_OVERRIDE_APPROVERS } from '../../sales-orders/dispatch-override-approvers';

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
  // color schema comments. All optional/site-specific, collected here at
  // generation time; also editable afterward via UpdateJeoDto.
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

  // Production-start gate: minimum-advance gate (MINIMUM_ADVANCE_PERCENT%
  // of the Sales Order's grandTotal) — only required/used when the active
  // Proforma Invoice's advanceReceived is below that minimum. See
  // JobExecutionOrdersService.create() for the actual gate (which also
  // requires the acting user to hold the Administrator role). Same shape as
  // UpdateSalesOrderStatusDto's dispatchOverrideApprovedBy/dispatchOverrideNote
  // and UpdateProformaInvoiceAdvanceDto's advanceOverrideApprovedBy/advanceOverrideNote.
  @ApiPropertyOptional({
    enum: DISPATCH_OVERRIDE_APPROVERS,
    description:
      'Required only to generate a JEO below the required advance minimum. Must be one of the two fixed approvers; the acting user must also be an Administrator.',
  })
  @IsOptional()
  @IsIn(DISPATCH_OVERRIDE_APPROVERS)
  productionOverrideApprovedBy?: string;

  @ApiPropertyOptional({
    example: 'Customer confirmed payment on delivery — production approved per Sales Manager.',
    description: 'Optional context for the below-minimum override. Recorded against the JEO.',
  })
  @IsOptional()
  @IsString()
  productionOverrideNote?: string;
}
