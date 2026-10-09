import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class QueryUserDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({ example: 'priya', description: 'Matches name or email' })
  @IsOptional()
  @IsString()
  search?: string;

  // QA fix: "Departments — clicking a department should navigate to the
  // Users page with the selected department automatically applied as a
  // filter." Lets Administration > Departments link to
  // /users?departmentId=... the same way Dashboard cards already link to
  // /leads?status=... (see LeadList.tsx's initialFiltersFromSearchParams).
  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsOptional()
  @IsUUID(undefined, { message: 'departmentId must be a valid department id' })
  departmentId?: string;
}
