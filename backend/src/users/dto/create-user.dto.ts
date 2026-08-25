import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'Priya Sharma' })
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  name: string;

  // Enterprise RBAC: login-by-Username-or-Email — this, alongside email, is
  // a valid login identifier (see LoginDto / AuthService.validateUser()).
  // Always stored lowercased.
  @ApiProperty({ example: 'priya.sharma', description: 'Login username (letters, numbers, dot, underscore)' })
  @IsString()
  @Matches(/^[a-zA-Z0-9_.]{3,32}$/, {
    message: 'Username must be 3-32 characters (letters, numbers, dot, underscore only)',
  })
  username: string;

  @ApiProperty({ example: 'priya.sharma@dailyops.com' })
  @IsEmail(undefined, { message: 'Email must be a valid email address' })
  email: string;

  // Additive: Lead Assignment enhancement also collects this on the quick
  // "+ Add User" modal, so it's optional here too for parity.
  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'Sales@123', description: 'Initial (temporary) password — the new user must change it on first login' })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsOptional()
  @IsUUID(undefined, { message: 'A valid department is required' })
  departmentId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Role ids to assign to this user' })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  roleIds?: string[];
}
