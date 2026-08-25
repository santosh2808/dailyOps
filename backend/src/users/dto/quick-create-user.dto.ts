import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

// Lead Assignment "+ Add User" modal — a deliberately smaller field set than
// the full Administration -> Users form (CreateUserDto): no username or
// password here. UsersService.quickCreate() auto-generates both (a unique
// username derived from the email, and a random temporary password) so
// every existing User invariant (unique username, hashed password,
// mustChangePassword forced true) still holds — this is a convenience entry
// point, not a different set of rules.
export class QuickCreateUserDto {
  @ApiProperty({ example: 'Priya Sharma' })
  @IsString()
  @IsNotEmpty({ message: 'Full name is required' })
  name: string;

  @ApiProperty({ example: 'priya.sharma@dailyops.com' })
  @IsEmail(undefined, { message: 'Email must be a valid email address' })
  email: string;

  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsOptional()
  @IsUUID(undefined, { message: 'A valid department is required' })
  departmentId?: string;

  // Restricted server-side to the Sales Executive / Sales Manager roles —
  // see UsersService.quickCreate() — since this entry point exists only to
  // populate the Lead Assignment dropdown, which is scoped to those two
  // roles.
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsUUID(undefined, { message: 'A valid role is required' })
  roleId: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
