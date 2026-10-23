import { ContentTemplateValidatorService } from '../../src/content/content-template-validator.service';

const KEY = 'content/spyro/2026/10/3f0c2a9e-0a4b-4c7e-9a51-2d8f1b6c9e10.jpg';
const DRAFT = { websiteCode: 'SPYRO', forPublish: false };
const PUBLISH = { websiteCode: 'SPYRO', forPublish: true };

const body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello warehouse owners' }] }] };

const completeBlog = {
  excerpt: 'How to size a fan',
  coverImage: { key: KEY, alt: 'Fans in a warehouse' },
  category: 'Guides',
  body,
};

const completeCaseStudy = {
  excerpt: 'Cooling a textile mill',
  coverImage: { key: KEY, alt: 'Mill floor' },
  industry: 'Factory',
  city: 'Hyderabad',
  state: 'Telangana',
  challenge: 'Too hot',
  solution: 'Eight fans',
  results: 'Cooler',
};

describe('ContentTemplateValidatorService', () => {
  const validator = new ContentTemplateValidatorService();
  const fields = (errors: { field: string }[]) => errors.map((e) => e.field);

  it('lets a draft be incomplete', () => {
    expect(validator.validate('BLOG', {}, DRAFT).errors).toEqual([]);
    expect(validator.validate('CASE_STUDY', { challenge: 'Too hot' }, DRAFT).errors).toEqual([]);
  });

  it('rejects present-but-invalid values even on a draft', () => {
    const { errors } = validator.validate(
      'BLOG',
      { category: 'Gossip', excerpt: 'x'.repeat(281), date: '2026-02-30', tags: Array.from({ length: 11 }, (_, i) => `t${i}`) },
      DRAFT,
    );
    expect(fields(errors).sort()).toEqual(['category', 'date', 'excerpt', 'tags']);
  });

  it('lists every missing required field and image description when publishing', () => {
    const { errors } = validator.validate('BLOG', { coverImage: { key: KEY } }, PUBLISH);
    expect(fields(errors).sort()).toEqual(['body', 'category', 'coverImage.alt', 'excerpt']);
    expect(errors.find((e) => e.field === 'excerpt')?.message).toBe('Summary is required to publish');
  });

  it('accepts a complete blog and case study for publishing', () => {
    expect(validator.validate('BLOG', completeBlog, PUBLISH).errors).toEqual([]);
    expect(validator.validate('CASE_STUDY', completeCaseStudy, PUBLISH).errors).toEqual([]);
  });

  it('drops unknown fields, trims text, and removes blank values', () => {
    const { value } = validator.validate(
      'BLOG',
      { excerpt: '  Summary  ', byline: '   ', isAdmin: true, coverImage: { key: KEY, alt: ' Fans ', url: 'https://x' } },
      DRAFT,
    );
    expect(value).toEqual({ excerpt: 'Summary', coverImage: { key: KEY, alt: 'Fans' } });
  });

  it('lowercases and de-duplicates tags', () => {
    expect(validator.validate('BLOG', { tags: ['HVLS', 'hvls', 'Warehouse Cooling'] }, DRAFT).value.tags).toEqual(['hvls', 'warehouse cooling']);
  });

  it('treats an empty article as missing', () => {
    const empty = { type: 'doc', content: [{ type: 'paragraph' }] };
    const result = validator.validate('BLOG', { ...completeBlog, body: empty }, PUBLISH);
    expect(result.value.body).toBeUndefined();
    expect(fields(result.errors)).toEqual(['body']);
  });

  it('rejects images that are not this website\'s DailyOps uploads', () => {
    const { errors } = validator.validate(
      'CASE_STUDY',
      { coverImage: { key: 'https://example.com/a.jpg' }, gallery: [{ key: KEY }, { key: KEY.replace('/spyro/', '/other/') }] },
      DRAFT,
    );
    expect(fields(errors)).toEqual(['coverImage.key', 'gallery.1.key']);
  });

  it('enforces case study limits: key results, gallery size, quote parts, client fields, video host', () => {
    const { errors } = validator.validate(
      'CASE_STUDY',
      {
        keyResults: Array.from({ length: 5 }, () => ({ value: '1', label: 'x' })),
        gallery: Array.from({ length: 13 }, () => ({ key: KEY })),
        quote: { text: 'Great' },
        clientName: 'Acme',
        anonymousClientLabel: 'A large mill',
        videoUrl: 'https://evil.example/watch?v=1',
        areaSqFt: 12.5,
      },
      DRAFT,
    );
    expect(fields(errors).sort()).toEqual(['anonymousClientLabel', 'areaSqFt', 'gallery', 'keyResults', 'quote.name', 'videoUrl']);
  });

  it('accepts YouTube and Vimeo links', () => {
    for (const videoUrl of ['https://www.youtube.com/watch?v=abc', 'https://youtu.be/abc', 'https://vimeo.com/123']) {
      expect(validator.validate('CASE_STUDY', { videoUrl }, DRAFT).errors).toEqual([]);
    }
  });

  it('"Other" industry needs its own name to publish; drafts may leave it blank', () => {
    const other = { ...completeCaseStudy, industry: 'Other' };
    expect(validator.validate('CASE_STUDY', other, DRAFT).errors).toEqual([]);
    expect(validator.validate('CASE_STUDY', other, PUBLISH).errors).toEqual([
      { field: 'industryOther', message: 'Industry name is required to publish' },
    ]);
    const named = validator.validate('CASE_STUDY', { ...other, industryOther: '  Cold storage ' }, PUBLISH);
    expect(named.errors).toEqual([]);
    expect(named.value.industryOther).toBe('Cold storage');
    expect(fields(validator.validate('CASE_STUDY', { ...other, industryOther: 'x'.repeat(61) }, DRAFT).errors)).toEqual(['industryOther']);
  });

  it('drops the industry name unless the industry is "Other"', () => {
    const { value, errors } = validator.validate('CASE_STUDY', { ...completeCaseStudy, industryOther: 'Cold storage' }, PUBLISH);
    expect(errors).toEqual([]);
    expect(value).not.toHaveProperty('industryOther');
  });

  it('rejects non-object data', () => {
    expect(validator.validate('BLOG', ['x'], DRAFT).errors).toEqual([{ field: 'data', message: 'Post data must be an object' }]);
  });
});
