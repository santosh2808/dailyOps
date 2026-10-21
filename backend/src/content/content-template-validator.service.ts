import { Injectable } from '@nestjs/common';
import { ContentPostType } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { ValidationError, validateSync } from 'class-validator';
import { FieldValidationError } from '../public-forms/form-schema-validator.service';
import { OTHER_INDUSTRY, VIDEO_HOSTS } from './content.constants';
import { FOREIGN_IMAGE_MESSAGE, isContentMediaKey } from './content-media';
import { sanitizeRichText } from './rich-text';
import { BlogDataDto } from './dto/blog-data.dto';
import { CaseStudyDataDto } from './dto/case-study-data.dto';

export interface TemplateValidationResult {
  // Cleaned data
  value: Record<string, unknown>;
  errors: FieldValidationError[];
  // Article text
  bodyText: string;
}

// Publish-required fields
const REQUIRED_TO_PUBLISH: Record<ContentPostType, Record<string, string>> = {
  BLOG: { excerpt: 'Summary', coverImage: 'Cover image', category: 'Category', body: 'Article' },
  CASE_STUDY: {
    excerpt: 'Summary',
    coverImage: 'Cover image',
    industry: 'Industry',
    city: 'City',
    state: 'State',
    challenge: 'The challenge',
    solution: 'Our solution',
    results: 'The results',
  },
};

// Image fields
const IMAGE_FIELDS: Record<ContentPostType, { name: string; list: boolean }[]> = {
  BLOG: [
    { name: 'coverImage', list: false },
    { name: 'ogImage', list: false },
  ],
  CASE_STUDY: [
    { name: 'coverImage', list: false },
    { name: 'clientLogo', list: false },
    { name: 'gallery', list: true },
  ],
};

// Template data validator
@Injectable()
export class ContentTemplateValidatorService {
  validate(
    type: ContentPostType,
    input: unknown,
    options: { websiteCode: string; forPublish: boolean },
  ): TemplateValidationResult {
    if (input === undefined || input === null) {
      input = {};
    }
    if (typeof input !== 'object' || Array.isArray(input)) {
      return { value: {}, errors: [{ field: 'data', message: 'Post data must be an object' }], bodyText: '' };
    }

    const normalized = (normalize(input) ?? {}) as Record<string, unknown>;
    if (type === 'BLOG' && Array.isArray(normalized.tags)) {
      normalized.tags = [...new Set(normalized.tags.map((tag) => (typeof tag === 'string' ? tag.toLowerCase() : tag)))];
    }

    const dtoClass = type === 'BLOG' ? BlogDataDto : CaseStudyDataDto;
    const instance = plainToInstance(dtoClass as new () => object, normalized);
    const errors = flatten(validateSync(instance, { whitelist: true, forbidUnknownValues: false }));
    const value = JSON.parse(JSON.stringify(instance)) as Record<string, unknown>;

    this.checkImages(type, value, options, errors);

    let bodyText = '';
    if (type === 'BLOG') {
      const body = sanitizeRichText(value.body, { field: 'body', websiteCode: options.websiteCode, forPublish: options.forPublish });
      errors.push(...body.errors);
      bodyText = body.text;
      if (body.value && (body.text || body.hasImage)) {
        value.body = body.value;
      } else {
        delete value.body; // empty article
      }
    }

    if (type === 'CASE_STUDY') {
      if (value.clientName && value.anonymousClientLabel) {
        errors.push({ field: 'anonymousClientLabel', message: 'Use either a client name or an anonymous label, not both' });
      }
      if (typeof value.videoUrl === 'string' && !isAllowedVideoUrl(value.videoUrl)) {
        errors.push({ field: 'videoUrl', message: 'Video link must be a YouTube or Vimeo address' });
      }
      // Name for Other
      if (value.industry !== OTHER_INDUSTRY) {
        delete value.industryOther;
      } else if (options.forPublish && value.industryOther === undefined && !errors.some((e) => e.field === 'industryOther')) {
        errors.push({ field: 'industryOther', message: 'Industry name is required to publish' });
      }
    }

    if (options.forPublish) {
      for (const [name, label] of Object.entries(REQUIRED_TO_PUBLISH[type])) {
        if (value[name] === undefined && !errors.some((e) => e.field === name || e.field.startsWith(`${name}.`))) {
          errors.push({ field: name, message: `${label} is required to publish` });
        }
      }
    }

    return { value, errors, bodyText };
  }

  private checkImages(
    type: ContentPostType,
    value: Record<string, unknown>,
    options: { websiteCode: string; forPublish: boolean },
    errors: FieldValidationError[],
  ) {
    for (const field of IMAGE_FIELDS[type]) {
      const raw = value[field.name];
      const images = field.list ? (Array.isArray(raw) ? raw : []) : raw ? [raw] : [];
      images.forEach((image: { key?: unknown; alt?: unknown }, index) => {
        const path = field.list ? `${field.name}.${index}` : field.name;
        if (!image || typeof image !== 'object') return;
        if (image.key !== undefined && !isContentMediaKey(image.key, options.websiteCode)) {
          errors.push({ field: `${path}.key`, message: FOREIGN_IMAGE_MESSAGE });
        }
        if (options.forPublish && !image.alt) {
          errors.push({ field: `${path}.alt`, message: 'Add a short image description (for accessibility and Google)' });
        }
      });
    }
  }
}

// Trim, drop blanks
function normalize(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  if (Array.isArray(value)) {
    const items = value.map(normalize).filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [name, child] of Object.entries(value)) {
      // Body kept as-is
      const normalized = name === 'body' ? child : normalize(child);
      if (normalized !== undefined && normalized !== null) out[name] = normalized;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return value === null ? undefined : value;
}

// Flatten errors
function flatten(errors: ValidationError[], prefix = ''): FieldValidationError[] {
  const out: FieldValidationError[] = [];
  for (const error of errors) {
    const field = prefix ? `${prefix}.${error.property}` : error.property;
    const messages = Object.values(error.constraints ?? {});
    if (messages.length) out.push({ field, message: messages[0] });
    if (error.children?.length) out.push(...flatten(error.children, field));
  }
  return out;
}

function isAllowedVideoUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && VIDEO_HOSTS.includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}
