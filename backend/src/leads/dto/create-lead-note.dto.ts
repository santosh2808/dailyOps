import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateLeadNoteDto {
  @ApiProperty({ example: 'Called the customer, they want a revised quote by Friday.' })
  @IsString()
  @IsNotEmpty()
  note: string;
}
