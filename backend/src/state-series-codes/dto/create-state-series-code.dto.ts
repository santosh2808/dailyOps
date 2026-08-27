import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, Min } from 'class-validator';
import { INDIA_STATES } from '../../common/india-states';

export class CreateStateSeriesCodeDto {
  @ApiProperty({ example: 'Telangana', enum: INDIA_STATES })
  @IsIn(INDIA_STATES, { message: 'state must be one of the recognized Indian states/UTs' })
  state: string;

  @ApiProperty({ example: 4000, description: "First number in this state's JEO numbering series" })
  @IsInt()
  @Min(1)
  seriesStart: number;
}
