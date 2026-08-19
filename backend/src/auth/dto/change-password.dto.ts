import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

// Self-service — POST /auth/change-password requires knowing the current
// password, unlike an Administrator's Reset Password action on someone
// else's account (see users/dto/reset-password.dto.ts).
export class ChangePasswordDto {
  @ApiProperty({ example: 'Admin@123' })
  @IsString()
  @MinLength(6)
  currentPassword: string;

  @ApiProperty({ example: 'NewSecurePass@456' })
  @IsString()
  @MinLength(6, { message: 'New password must be at least 6 characters' })
  newPassword: string;
}
