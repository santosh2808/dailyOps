import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsObject, IsOptional } from 'class-validator';

// `schema` is validated structurally (fields map of {type, required,
// label?, options?}) by FormConfigurationService.createFormVersion() rather
// than class-validator, since its shape is inherently dynamic (one entry
// per form field, field names unknown ahead of time) — the same reason
// FormSchemaValidatorService exists for validating a *submission's* fields
// against this schema.
export class CreateFormVersionDto {
  @ApiProperty({
    description:
      'Shape: { "fields": { "<fieldName>": { "type": "string"|"number"|"boolean", "required": boolean, "label"?: string, "options"?: {value,label}[] } } }',
    example: {
      fields: {
        fullName: { type: 'string', required: true },
        email: { type: 'string', required: false },
        subject: {
          type: 'string',
          required: true,
          options: [{ value: 'GENERAL_ENQUIRY', label: 'General Enquiry' }],
        },
      },
    },
  })
  @IsObject()
  @IsNotEmpty({ message: 'Schema is required' })
  schema: Record<string, unknown>;

  @ApiPropertyOptional({
    default: true,
    description: 'When true (the default), this version is published immediately instead of created as a draft.',
  })
  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}
