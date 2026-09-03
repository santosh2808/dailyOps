import { Injectable } from '@nestjs/common';

export interface FormFieldOption {
  value: string;
  label: string;
}

export interface FieldSchema {
  type: 'string' | 'number' | 'boolean';
  required?: boolean;
  label?: string;
  // Additive vs. the old form-submissions validator: enum-style selectors
  // (e.g. `subject`) carry their allowed values here — see stage 1's
  // seed.ts FormVersion.schema. Not enforced as a hard match by this
  // validator on its own (PublicFormsService separately resolves/validates
  // `subjectCode` against FormSubjectRoute, which is the real source of
  // truth for what's routable) — kept here purely so the type-check below
  // still runs for these fields like any other string field.
  options?: FormFieldOption[];
}

export interface FormSchema {
  fields: Record<string, FieldSchema>;
}

export interface FieldValidationError {
  field: string;
  message: string;
}

// Pure function, no DB access — validates a public submission's `fields`
// payload against the dynamic schema stored on a FormVersion row.
//
// Tightened vs. the old form-submissions module's validator (which is being
// deleted, since it validated against FormSubmission's now-deleted model):
// an extra key in `fields` that isn't declared in schema.fields is now
// REJECTED rather than silently passed through — requirement §5 calls for
// rejecting "unknown/invalid fields according to the published schema", and
// the global ValidationPipe's `whitelist: true` can't help here since
// `fields` is a plain Record<string, unknown> bag, not individual DTO
// properties.
@Injectable()
export class FormSchemaValidatorService {
  validate(schema: FormSchema, fields: Record<string, unknown>): FieldValidationError[] {
    const errors: FieldValidationError[] = [];
    const declaredNames = new Set(Object.keys(schema.fields ?? {}));

    for (const [name, fieldSchema] of Object.entries(schema.fields ?? {})) {
      const value = fields[name];
      const isMissing = value === undefined || value === null || value === '';

      if (fieldSchema.required && isMissing) {
        errors.push({ field: name, message: `${name} is required` });
        continue;
      }
      if (isMissing) {
        continue;
      }
      if (!this.matchesType(value, fieldSchema.type)) {
        errors.push({ field: name, message: `${name} must be a ${fieldSchema.type}` });
      }
    }

    for (const name of Object.keys(fields)) {
      if (!declaredNames.has(name)) {
        errors.push({ field: name, message: `${name} is not a recognized field on this form` });
      }
    }

    return errors;
  }

  private matchesType(value: unknown, type: FieldSchema['type']): boolean {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !Number.isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      default:
        return true;
    }
  }
}
