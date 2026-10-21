import { HttpException } from '@nestjs/common';
import { PublicContentService } from '../../src/public-content/public-content.service';

const KEY = 'content/spyro/2026/10/3f0c2a9e-0a4b-4c7e-9a51-2d8f1b6c9e10.jpg';

const blogSnapshot = {
  type: 'BLOG',
  slug: 'sizing-guide',
  title: 'Sizing guide',
  excerpt: 'How to size a fan',
  coverImage: { key: KEY, alt: 'Fans' },
  category: 'Guides',
  byline: 'Spyro Fans Team',
  date: '2026-10-15',
  readMinutes: 3,
  body: { type: 'doc', content: [] },
  seoTitle: null,
  publishedAt: '2026-10-15T04:00:00.000Z',
  updatedAt: '2026-10-16T04:00:00.000Z',
};

function setup(website: { id: string; status: string } | null = { id: 'w1', status: 'ACTIVE' }) {
  const prisma: any = {
    formDefinition: { findUnique: jest.fn().mockResolvedValue(website ? { formWebsite: website } : null) },
    contentPost: {
      findMany: jest.fn().mockResolvedValue([{ type: 'BLOG', publishedData: blogSnapshot }]),
      count: jest.fn().mockResolvedValue(1),
      findFirst: jest.fn().mockResolvedValue({ publishedData: blogSnapshot }),
    },
  };
  return { prisma, svc: new PublicContentService(prisma) };
}

async function caught(promise: Promise<unknown>): Promise<HttpException> {
  try {
    await promise;
  } catch (error) {
    return error as HttpException;
  }
  throw new Error('expected the call to throw');
}
const code = (error: HttpException) => (error.getResponse() as { code: string }).code;

describe('PublicContentService', () => {
  afterEach(() => delete process.env.CONTENT_MEDIA_PUBLIC_BASE_URL);

  it('an unknown public form key is a 404', async () => {
    const error = await caught(setup(null).svc.listPosts('fm_nope', {}));
    expect(error.getStatus()).toBe(404);
    expect(code(error)).toBe('WEBSITE_NOT_FOUND');
  });

  it('an inactive website returns nothing, even for published posts', async () => {
    const { prisma, svc } = setup({ id: 'w1', status: 'INACTIVE' });
    expect(code(await caught(svc.listPosts('fm_key', {})))).toBe('WEBSITE_INACTIVE');
    expect(code(await caught(svc.getPost('fm_key', 'sizing-guide')))).toBe('WEBSITE_INACTIVE');
    expect(prisma.contentPost.findMany).not.toHaveBeenCalled();
    expect(prisma.contentPost.findFirst).not.toHaveBeenCalled();
  });

  it('looks up the website only — a disabled contact form does not hide content', async () => {
    const { prisma, svc } = setup();
    await svc.listPosts('fm_key', {});
    expect(prisma.formDefinition.findUnique).toHaveBeenCalledWith({
      where: { publicFormKey: 'fm_key' },
      select: { formWebsite: { select: { id: true, status: true } } },
    });
  });

  it('lists only PUBLISHED posts of that website, newest first, as cards without the article', async () => {
    process.env.CONTENT_MEDIA_PUBLIC_BASE_URL = 'https://media.example.com';
    const { prisma, svc } = setup();
    const result = await svc.listPosts('fm_key', { type: 'BLOG', category: 'Guides', page: 2, limit: 5 });

    const args = prisma.contentPost.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ formWebsiteId: 'w1', status: 'PUBLISHED', type: 'BLOG' });
    expect(args.where.AND).toEqual([{ publishedData: { path: ['category'], equals: 'Guides' } }]);
    expect(args.orderBy).toEqual([{ featured: 'desc' }, { publishedAt: 'desc' }, { id: 'asc' }]);
    expect(args).toMatchObject({ skip: 5, take: 5 });
    expect(args.select).toEqual({ type: true, publishedData: true });

    const card = result.data[0] as Record<string, any>;
    expect(card).not.toHaveProperty('body');
    expect(card).not.toHaveProperty('seoTitle');
    expect(card.coverImage.url).toBe(`https://media.example.com/${KEY}`);
    expect(result).toMatchObject({ total: 1, page: 2, limit: 5, totalPages: 1 });
  });

  it('serves one published post by slug, with image URLs', async () => {
    process.env.CONTENT_MEDIA_PUBLIC_BASE_URL = 'https://media.example.com';
    const { prisma, svc } = setup();
    const post = (await svc.getPost('fm_key', 'sizing-guide')) as Record<string, any>;
    expect(prisma.contentPost.findFirst.mock.calls[0][0].where).toEqual({ formWebsiteId: 'w1', slug: 'sizing-guide', status: 'PUBLISHED' });
    expect(post.body).toEqual({ type: 'doc', content: [] });
    expect(post.coverImage.url).toBe(`https://media.example.com/${KEY}`);
  });

  it('a draft, archived or missing slug is a 404; a malformed slug never reaches the database', async () => {
    const { prisma, svc } = setup();
    prisma.contentPost.findFirst.mockResolvedValue(null);
    expect(code(await caught(svc.getPost('fm_key', 'draft-post')))).toBe('POST_NOT_FOUND');

    prisma.contentPost.findFirst.mockClear();
    expect(code(await caught(svc.getPost('fm_key', '../etc/passwd')))).toBe('POST_NOT_FOUND');
    expect(prisma.contentPost.findFirst).not.toHaveBeenCalled();
  });
});
