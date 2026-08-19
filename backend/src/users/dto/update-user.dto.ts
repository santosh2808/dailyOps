import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

// Password is deliberately excluded here — general Edit never sets a
// password. That's Reset Password's job (its own dedicated endpoint, see
// UsersController.resetPassword() / ResetPasswordDto), which always forces
// the user to change it again on next login. Keeping the two apart matches
// the spec's own distinct bullets ("Edit Users" vs. "Reset Passwords").
export class UpdateUserDto extends PartialType(OmitType(CreateUserDto, ['password'] as const)) {
  @ApiPropertyOptional({ example: true, description: 'false = disabled (soft delete)' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
