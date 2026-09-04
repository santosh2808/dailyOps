import { ApiPropertyOptional } from '@nestjs/swagger';
import { FormDestinationType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

// subjectCode is immutable after creation — routing resolution keys off it,
// same "identity fields don't change" convention as UpdateFormWebsiteProductDto
// keeping productId immutable.
export class UpdateFormSubjectRouteDto {
  @ApiPropertyOptional({ example: 'General Enquiry' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Subject label cannot be blank' })
  subjectLabel?: string;

  @ApiPropertyOptional({ enum: FormDestinationType })
  @IsOptional()
  @IsEnum(FormDestinationType)
  destinationType?: FormDestinationType;

  @ApiPropertyOptional({ description: 'Set to null to clear the product restriction' })
  @IsOptional()
  @IsUUID()
  productId?: string | null;

  @ApiPropertyOptional({ description: 'Set to null to clear the default department' })
  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @ApiPropertyOptional({ description: 'Set to null to clear the default assignee' })
  @IsOptional()
  @IsUUID()
  assignedUserId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
