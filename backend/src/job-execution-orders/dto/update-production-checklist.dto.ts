import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

// Every field is independently optional/partial — the Production Checklist
// card in the UI toggles one checkbox at a time and PATCHes just that
// field, the same partial-update convention used elsewhere in this API.
export class UpdateProductionChecklistDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  materialIssued?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  assemblyStarted?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  controllerInstalled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  wiringCompleted?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  qcPassed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  packed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  readyForDispatch?: boolean;
}
