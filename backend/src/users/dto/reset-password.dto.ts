import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

// Administrator action ("Reset Passwords") — sets a new password on
// someone else's account without needing to know the old one. Always
// forces that user to change it again on next login (see
// UsersService.resetPassword()).
export class ResetPasswordDto {
  @ApiProperty({ example: 'TempPass@789' })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  newPassword: string;
}
