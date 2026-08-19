import { ApiProperty } from '@nestjs/swagger';
import { JeoStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateJeoStatusDto {
  @ApiProperty({ enum: JeoStatus, example: JeoStatus.MATERIAL_READY })
  @IsEnum(JeoStatus)
  status: JeoStatus;
}
