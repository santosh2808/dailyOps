import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

// Deliberately has NO `destination`/`destinationType`/`departmentId`/
// `assignedUserId` field of any kind — routing is entirely
// server-resolved from FormSubjectRoute (see PublicFormsService.submit()).
// If a caller sends one anyway, the global ValidationPipe's
// `whitelist: true` strips it before it ever reaches the service (it is
// never read even accidentally).
export class CreatePublicFormSubmissionDto {
  @ApiProperty({ example: 'GENERAL_ENQUIRY', description: 'One of this form\'s published subjectOptions codes' })
  @IsString()
  @IsNotEmpty({ message: 'subjectCode is required' })
  subjectCode: string;

  @ApiProperty({
    description: "The form's own fields (everything from commonFields except `subject`/the product selector), validated against the published schema",
    example: { fullName: 'Jane Doe', email: 'jane@example.com', phone: '9876543210', message: 'Interested in a quote' },
  })
  @IsObject()
  @IsNotEmpty({ message: 'fields is required' })
  fields: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'SPYRO-24', description: "One of this website's published products[].code, if this form offers product selection" })
  @IsOptional()
  @IsString()
  productCode?: string;

  @ApiPropertyOptional({ description: 'Client-supplied de-dupe key — a retried submission with the same key returns the original reference number instead of creating a duplicate' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
