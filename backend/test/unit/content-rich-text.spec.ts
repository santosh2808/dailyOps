import { readMinutes, sanitizeRichText } from '../../src/content/rich-text';

const KEY = 'content/spyro/2026/10/3f0c2a9e-0a4b-4c7e-9a51-2d8f1b6c9e10.jpg';
const OPTIONS = { field: 'body', websiteCode: 'SPYRO', forPublish: false };

function doc(...content: unknown[]) {
  return { type: 'doc', content };
}
function paragraph(text: string, marks?: unknown[]) {
  return { type: 'paragraph', content: [{ type: 'text', text, ...(marks ? { marks } : {}) }] };
}

describe('sanitizeRichText', () => {
  it('keeps allowed nodes and marks, and drops unknown attributes', () => {
    const input = doc(
      { type: 'heading', attrs: { level: 2, id: 'x', class: 'big' }, content: [{ type: 'text', text: 'Why HVLS' }] },
      paragraph('Read our guide', [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://spyrofans.com/guide', target: '_blank', rel: 'x', onclick: 'y' } }]),
      { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph('One')] }] },
      { type: 'image', attrs: { key: KEY, alt: 'Fans', src: 'https://evil.example/x.jpg', width: 10 } },
    );

    const result = sanitizeRichText(input, OPTIONS);

    expect(result.errors).toEqual([]);
    expect(result.value?.content?.[0]).toEqual({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Why HVLS' }] });
    expect(result.value?.content?.[1].content?.[0].marks).toEqual([
      { type: 'bold' },
      { type: 'link', attrs: { href: 'https://spyrofans.com/guide', target: '_blank' } },
    ]);
    expect(result.value?.content?.[3]).toEqual({ type: 'image', attrs: { key: KEY, alt: 'Fans' } });
    expect(result.text).toBe('Why HVLS Read our guide One');
    expect(result.hasImage).toBe(true);
  });

  it('turns any heading level other than 3 into level 2 (the title is the only h1)', () => {
    const result = sanitizeRichText(doc({ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'T' }] }), OPTIONS);
    expect(result.value?.content?.[0].attrs).toEqual({ level: 2 });
  });

  it.each([
    ['an unknown node type', doc({ type: 'iframe', attrs: { src: 'https://x' } })],
    ['raw HTML smuggled as a node', doc({ type: 'html', content: [{ type: 'text', text: '<script>alert(1)</script>' }] })],
    ['a code block', doc({ type: 'codeBlock', content: [{ type: 'text', text: 'x' }] })],
    ['an unknown mark', doc(paragraph('x', [{ type: 'textStyle', attrs: { color: 'red' } }]))],
    ['a node in the wrong place', doc({ type: 'listItem', content: [paragraph('x')] })],
  ])('rejects %s', (_label, input) => {
    const result = sanitizeRichText(input, OPTIONS);
    expect(result.value).toBeUndefined();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].field).toBe('body');
  });

  it.each(['javascript:alert(1)', 'data:text/html;base64,xx', '//evil.example', 'vbscript:x'])('rejects the link %s', (href) => {
    const result = sanitizeRichText(doc(paragraph('click', [{ type: 'link', attrs: { href } }])), OPTIONS);
    expect(result.errors).toEqual([{ field: 'body', message: 'Links must start with https://, http://, mailto:, tel: or /' }]);
  });

  it.each(['https://spyrofans.com', 'mailto:info@spyrofans.com', 'tel:+91 40 1234 5678', '/contact'])('accepts the link %s', (href) => {
    expect(sanitizeRichText(doc(paragraph('x', [{ type: 'link', attrs: { href } }])), OPTIONS).errors).toEqual([]);
  });

  it('rejects images that were not uploaded through DailyOps, or belong to another website', () => {
    const external = sanitizeRichText(doc({ type: 'image', attrs: { src: 'https://example.com/a.jpg' } }), OPTIONS);
    const otherSite = sanitizeRichText(doc({ type: 'image', attrs: { key: KEY.replace('/spyro/', '/other/') } }), OPTIONS);
    expect(external.errors[0].message).toBe('Article images must be uploaded through DailyOps');
    expect(otherSite.errors[0].message).toBe('Article images must be uploaded through DailyOps');
  });

  it('requires image descriptions only when publishing', () => {
    const input = doc({ type: 'image', attrs: { key: KEY } });
    expect(sanitizeRichText(input, OPTIONS).errors).toEqual([]);
    expect(sanitizeRichText(input, { ...OPTIONS, forPublish: true }).errors).toEqual([
      { field: 'body', message: 'Every image in the article needs a short description' },
    ]);
  });

  it('rejects documents that are not editor JSON, too deep, or too large', () => {
    expect(sanitizeRichText('<p>hi</p>', OPTIONS).errors[0].message).toBe('Article must be an editor document');
    let deep: Record<string, unknown> = paragraph('x');
    for (let i = 0; i < 15; i++) deep = { type: 'blockquote', content: [deep] };
    expect(sanitizeRichText(doc(deep), OPTIONS).errors[0].message).toBe('Article is nested too deeply');
    const huge = doc(...Array.from({ length: 3000 }, () => paragraph('x'.repeat(100))));
    expect(sanitizeRichText(huge, OPTIONS).errors[0].message).toMatch(/^Article is too long/);
  });

  it('treats a missing body as empty, not as an error', () => {
    expect(sanitizeRichText(undefined, OPTIONS)).toEqual({ value: undefined, errors: [], text: '', hasImage: false });
  });
});

describe('readMinutes', () => {
  it('is at least 1 and about 200 words per minute', () => {
    expect(readMinutes('')).toBe(1);
    expect(readMinutes(Array.from({ length: 1000 }, () => 'word').join(' '))).toBe(5);
  });
});
