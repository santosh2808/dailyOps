import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { INDIA_STATES } from '../../common/india-states';

export class CreateCustomerDto {
  @ApiProperty({ example: 'Acme Corp' })
  @IsString()
  @IsNotEmpty({ message: 'Company name is required' })
  companyName: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty({ message: 'Contact person is required' })
  contactPerson: string;

  @ApiProperty({ example: '9876543210' })
  @IsString()
  @Matches(/^\d{10,15}$/, { message: 'Phone must be 10-15 digits' })
  phone: string;

  @ApiPropertyOptional({ example: 'john@acme.com' })
  @IsOptional()
  @IsEmail({}, { message: 'Email must be a valid email address' })
  email?: string;

  @ApiPropertyOptional({ example: '27ABCDE1234F1Z5' })
  @IsOptional()
  @IsString()
  gstNumber?: string;

  // Additive: Dashboard Redesign v2 — India Sales Map. Optional so existing
  // create/update flows that don't send it keep working unchanged.
  @ApiPropertyOptional({ example: 'Maharashtra', enum: INDIA_STATES })
  @IsOptional()
  @IsIn(INDIA_STATES)
  state?: string;
}
