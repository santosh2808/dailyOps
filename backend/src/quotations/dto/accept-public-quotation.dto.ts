import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';

// class-validator has no built-in "must be exactly true" check — implemented
// as a tiny custom decorator instead of pulling in a new dependency for one
// field ("I confirm that I have reviewed and accept this quotation.").

function IsTrue(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isTrue',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return value === true;
        },
        defaultMessage() {
          return 'You must confirm you have reviewed and accept this quotation';
        },
      },
    });
  };
}

// Customer Quotation Acceptance workflow (section 4) — the public,
// unauthenticated "Accept Quotation" confirmation form. Deliberately tiny:
// only what a customer actually fills in, nothing that could be mistaken
// for an internal/administrative field.
export class AcceptPublicQuotationDto {
  @ApiProperty({ example: 'Rajesh Kumar' })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({ example: 'Procurement Manager' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  designation?: string;

  @ApiPropertyOptional({ example: 'Please proceed with delivery at the earliest.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @ApiProperty({
    description: 'Must be true — "I confirm that I have reviewed and accept this quotation."',
  })
  @IsBoolean()
  @IsTrue()
  confirm: boolean;
}
