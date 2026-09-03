import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ReplyToCustomerDto {
  @ApiProperty({ description: 'Plain-text message to send to whoever reported this complaint' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  message: string;
}
