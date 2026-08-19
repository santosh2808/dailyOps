import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  // Deliberately not @IsEmail() — this accepts either the user's `username`
  // or their `email`; AuthService.validateUser() resolves whichever one was
  // typed (see UsersService.findByUsernameOrEmail()).
  @ApiProperty({ example: 'admin', description: 'Username or email address' })
  @IsString()
  @IsNotEmpty({ message: 'Username or email is required' })
  identifier: string;

  @ApiProperty({ example: 'Admin@123' })
  @IsString()
  @MinLength(6)
  password: string;
}
