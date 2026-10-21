import { BadRequestException, ConflictException, HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ContentService } from '../../src/content/content.service';
import { ContentTemplateValidatorService } from '../../src/content/content-template-validator.service';

const KEY = 'content/spyro/2026/10/3f0c2a9e-0a4b-4c7e-9a51-2d8f1b6c9e10.jpg';
const ACTOR = { id: 'u2', name: 'Divya' };
const MAPPING_ID = '6f1c1d1e-1111-4a2b-9c3d-000000000001';

const words = (n: number) => Array.from({ length: n }, () => 'fan').join(' ');
const blogData = {
  excerpt: 'How to size a fan',
  coverImage: { key: KEY, alt: 'Fans in a warehouse' },
  category: 'Guides',
  body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: words(600) }] }] },
};
const caseStudyData = {
  excerpt: 'Cooling a textile mill',
  coverImage: { key: KEY, alt: 'Mill floor' },
  industry: 'Factory',
  city: 'Hyderabad',
  state: 'Telangana',
  challenge: 'Too hot',
  solution: 'Eight fans',
  results: 'Cooler',
};

function makePost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    formWebsiteId: 'w1',
    formWebsite: { id: 'w1', code: 'SPYRO', name: 'SPYRO', status: 'ACTIVE' },
    type: 'BLOG',
    slug: 'choosing-hvls-fan-size',
    title: 'Choosing an HVLS fan size',
    status: 'DRAFT',
    featured: false,
    seoTitle: null,
    seoDescription: null,
    data: blogData,
    publishedData: null,
    hasUnpublishedChanges: false,
    version: 3,
    authorId: 'u1',
    author: { id: 'u1', name: 'Asha' },
    updatedById: 'u1',
    updatedBy: { id: 'u1', name: 'Asha' },
    publishedAt: null,
    lastPublishedAt: null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-02T00:00:00Z'),
    products: [],
    ...overrides,
  };
}

function setup(post: Record<string, unknown> | null = makePost()) {
  const prisma: any = {
    formWebsite: { findUnique: jest.fn().mockResolvedValue({ id: 'w1', code: 'SPYRO' }) },
    formWebsiteProduct: { findMany: jest.fn().mockResolvedValue([]) },
    contentPost: {
      findUnique: jest.fn().mockResolvedValue(post),
      create: jest.fn().mockResolvedValue(post),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    contentPostProduct: { deleteMany: jest.fn(), createMany: jest.fn() },
  };
  prisma.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const media = { upload: jest.fn().mockResolvedValue({ key: 'k', url: null }) };
  const svc = new ContentService(prisma, audit as any, new ContentTemplateValidatorService(), media as any);
  return { prisma, audit, media, svc };
}

async function caught(promise: Promise<unknown>): Promise<HttpException> {
  try {
    await promise;
  } catch (error) {
    return error as HttpException;
  }
  throw new Error('expected the call to throw');
}
const body = (error: HttpException) => error.getResponse() as { code?: string; errors?: { field: string }[] };

describe('ContentService', () => {
  describe('create', () => {
    const dto = { formWebsiteId: 'w1', type: 'BLOG' as const, title: '  Sizing guide ', slug: 'sizing-guide', data: { excerpt: 'x' } };

    it('creates a draft authored by the logged-in user and audit-logs it', async () => {
      const { prisma, audit, svc } = setup();
      await svc.create(dto, ACTOR);

      const data = prisma.contentPost.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ title: 'Sizing guide', slug: 'sizing-guide', authorId: 'u2', updatedById: 'u2', data: { excerpt: 'x' } });
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ module: 'Content', action: 'PostCreated', actorName: 'Divya' }));
    });

    it('maps a concurrent duplicate slug (P2002) to a clear 409, not a 500', async () => {
      const { prisma, audit, svc } = setup();
      prisma.contentPost.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '5.22.0' }),
      );

      const error = await caught(svc.create(dto, ACTOR));
      expect(error).toBeInstanceOf(ConflictException);
      expect(body(error).code).toBe('SLUG_TAKEN');
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('rejects products on a blog and products from another website', async () => {
      const { prisma, svc } = setup();
      const blogError = await caught(svc.create({ ...dto, products: [{ formWebsiteProductId: MAPPING_ID, quantity: 2 }] }, ACTOR));
      expect(body(blogError).errors?.map((e) => e.field)).toEqual(['products']);

      prisma.formWebsiteProduct.findMany.mockResolvedValue([]); // Not w1 mapping
      const caseError = await caught(
        svc.create({ ...dto, type: 'CASE_STUDY', data: {}, products: [{ formWebsiteProductId: MAPPING_ID, quantity: 2 }] }, ACTOR),
      );
      expect(caseError).toBeInstanceOf(BadRequestException);
      expect(body(caseError).errors?.map((e) => e.field)).toEqual(['products.0.formWebsiteProductId']);
      expect(prisma.contentPost.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('refuses a save based on an old version without writing', async () => {
      const { prisma, svc } = setup();
      const error = await caught(svc.update('p1', { version: 2, title: 'New' }, ACTOR));
      expect(body(error).code).toBe('STALE');
      expect(prisma.contentPost.updateMany).not.toHaveBeenCalled();
    });

    it('refuses a save that lost a race to another save (0 rows matched)', async () => {
      const { prisma, svc } = setup();
      prisma.contentPost.updateMany.mockResolvedValue({ count: 0 });
      const error = await caught(svc.update('p1', { version: 3, title: 'New' }, ACTOR));
      expect(body(error).code).toBe('STALE');
    });

    it('saving a published post never touches the live copy, only flags unpublished changes', async () => {
      const { prisma, svc } = setup(makePost({ status: 'PUBLISHED', publishedData: { title: 'Live' } }));
      await svc.update('p1', { version: 3, title: 'Edited' }, ACTOR);

      const call = prisma.contentPost.updateMany.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'p1', version: 3 });
      expect(call.data).toMatchObject({ title: 'Edited', hasUnpublishedChanges: true, version: { increment: 1 } });
      expect(call.data).not.toHaveProperty('publishedData');
    });

    it('locks the URL name while published, and refuses edits to archived posts', async () => {
      const published = setup(makePost({ status: 'PUBLISHED' }));
      expect(body(await caught(published.svc.update('p1', { version: 3, slug: 'new-name' }, ACTOR))).code).toBe('SLUG_LOCKED');

      const archived = setup(makePost({ status: 'ARCHIVED' }));
      expect(body(await caught(archived.svc.update('p1', { version: 3, title: 'x' }, ACTOR))).code).toBe('ARCHIVED');
    });

    it('replaces the products list inside the same transaction', async () => {
      const { prisma, svc } = setup(makePost({ type: 'CASE_STUDY', data: caseStudyData }));
      prisma.formWebsiteProduct.findMany.mockResolvedValue([{ id: MAPPING_ID, enabled: true }]);
      await svc.update('p1', { version: 3, products: [{ formWebsiteProductId: MAPPING_ID, quantity: 8 }] }, ACTOR);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.contentPostProduct.deleteMany).toHaveBeenCalledWith({ where: { contentPostId: 'p1' } });
      expect(prisma.contentPostProduct.createMany).toHaveBeenCalledWith({
        data: [{ formWebsiteProductId: MAPPING_ID, quantity: 8, displayOrder: 0, contentPostId: 'p1' }],
      });
    });

    it('moves a draft to another website and audit-logs both websites', async () => {
      const { prisma, audit, svc } = setup(makePost({ data: { excerpt: 'x' } }));
      prisma.formWebsite.findUnique.mockResolvedValue({ id: 'w2', code: 'ACME' });
      await svc.update('p1', { version: 3, formWebsiteId: 'w2' }, ACTOR);

      expect(prisma.contentPost.updateMany.mock.calls[0][0].data).toMatchObject({ formWebsiteId: 'w2' });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PostUpdated',
          oldValue: expect.objectContaining({ website: 'SPYRO' }),
          newValue: expect.objectContaining({ website: 'ACME' }),
        }),
      );
    });

    it('locks the website while published', async () => {
      const { prisma, svc } = setup(makePost({ status: 'PUBLISHED' }));
      const error = await caught(svc.update('p1', { version: 3, formWebsiteId: 'w2' }, ACTOR));
      expect(error).toBeInstanceOf(ConflictException);
      expect(body(error).code).toBe('WEBSITE_LOCKED');
      expect(prisma.contentPost.updateMany).not.toHaveBeenCalled();
    });

    it('a move flags images uploaded for the old website, with a clear message', async () => {
      const { prisma, svc } = setup();
      prisma.formWebsite.findUnique.mockResolvedValue({ id: 'w2', code: 'ACME' });
      const error = await caught(svc.update('p1', { version: 3, formWebsiteId: 'w2' }, ACTOR));

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error.getResponse() as { errors: { field: string; message: string }[] }).errors).toContainEqual({
        field: 'coverImage.key',
        message: 'Uploaded for SPYRO. Remove it and upload it again for ACME.',
      });
      expect(prisma.contentPost.updateMany).not.toHaveBeenCalled();
    });

    it('a move checks the stored case study products against the new website', async () => {
      const { prisma, svc } = setup(
        makePost({ type: 'CASE_STUDY', data: { excerpt: 'x' }, products: [{ formWebsiteProductId: MAPPING_ID, quantity: 8 }] }),
      );
      prisma.formWebsite.findUnique.mockResolvedValue({ id: 'w2', code: 'ACME' });
      const error = await caught(svc.update('p1', { version: 3, formWebsiteId: 'w2' }, ACTOR));

      expect(prisma.formWebsiteProduct.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: [MAPPING_ID] }, formWebsiteId: 'w2' } }));
      expect(body(error).errors).toContainEqual(expect.objectContaining({ field: 'products.0.formWebsiteProductId' }));
    });
  });

  describe('publish', () => {
    it('lists every missing field and does not publish', async () => {
      const { prisma, svc } = setup(makePost({ data: { excerpt: 'x' } }));
      const error = await caught(svc.publish('p1', 3, ACTOR));
      expect(body(error).code).toBe('VALIDATION_FAILED');
      expect(body(error).errors?.map((e) => e.field).sort()).toEqual(['body', 'category', 'coverImage']);
      expect(prisma.contentPost.updateMany).not.toHaveBeenCalled();
    });

    it('freezes a snapshot with byline, date and reading time, keeping the first publish date', async () => {
      const firstPublished = new Date('2026-09-01T06:00:00Z');
      const { prisma, audit, svc } = setup(makePost({ status: 'PUBLISHED', publishedAt: firstPublished }));
      await svc.publish('p1', 3, ACTOR);

      const data = prisma.contentPost.updateMany.mock.calls[0][0].data;
      expect(data).toMatchObject({ status: 'PUBLISHED', hasUnpublishedChanges: false, publishedAt: firstPublished, version: { increment: 1 } });
      expect(data.publishedData).toMatchObject({
        type: 'BLOG',
        slug: 'choosing-hvls-fan-size',
        title: 'Choosing an HVLS fan size',
        byline: 'Spyro Fans Team',
        date: '2026-09-01',
        readMinutes: 3,
        coverImage: { key: KEY, alt: 'Fans in a warehouse' },
      });
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'PostLiveUpdated' }));
    });

    it('uses a back-dated blog date (India time) as the publish date', async () => {
      const { prisma, audit, svc } = setup(makePost({ data: { ...blogData, date: '2025-12-31' } }));
      await svc.publish('p1', 3, ACTOR);

      const data = prisma.contentPost.updateMany.mock.calls[0][0].data;
      expect(data.publishedAt.toISOString()).toBe('2025-12-30T18:30:00.000Z');
      expect(data.publishedData.date).toBe('2025-12-31');
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'PostPublished' }));
    });

    it('requires at least one enabled product on a case study', async () => {
      const none = setup(makePost({ type: 'CASE_STUDY', data: caseStudyData }));
      expect(body(await caught(none.svc.publish('p1', 3, ACTOR))).errors?.map((e) => e.field)).toEqual(['products']);

      const disabled = setup(
        makePost({
          type: 'CASE_STUDY',
          data: caseStudyData,
          products: [{ quantity: 8, formWebsiteProduct: { id: MAPPING_ID, publicCode: 'SPYRO-24', label: 'Spyro 24', enabled: false } }],
        }),
      );
      expect(body(await caught(disabled.svc.publish('p1', 3, ACTOR))).errors?.map((e) => e.field)).toEqual([
        'products.0.formWebsiteProductId',
      ]);
    });

    it('snapshots case study products by their public code and label', async () => {
      const { prisma, svc } = setup(
        makePost({
          type: 'CASE_STUDY',
          data: caseStudyData,
          products: [
            { quantity: 8, formWebsiteProduct: { id: MAPPING_ID, publicCode: 'SPYRO-24', label: 'Spyro 24', enabled: true, product: { fanType: 'ROOF' } } },
          ],
        }),
      );
      await svc.publish('p1', 3, ACTOR);
      expect(prisma.contentPost.updateMany.mock.calls[0][0].data.publishedData.products).toEqual([
        { publicCode: 'SPYRO-24', label: 'Spyro 24', fanType: 'ROOF', quantity: 8 },
      ]);
    });
  });

  describe('unpublish / archive / restore', () => {
    it('unpublish removes the live copy and keeps the draft', async () => {
      const { prisma, audit, svc } = setup(makePost({ status: 'PUBLISHED', publishedData: { title: 'Live' } }));
      await svc.unpublish('p1', 3, ACTOR);

      const data = prisma.contentPost.updateMany.mock.calls[0][0].data;
      expect(data.status).toBe('DRAFT');
      expect(data.publishedData).toBe(Prisma.DbNull);
      expect(data).not.toHaveProperty('data');
      expect(data).not.toHaveProperty('publishedAt');
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'PostUnpublished' }));
    });

    it('archive hides the post everywhere; restore brings it back as a draft', async () => {
      const live = setup(makePost({ status: 'PUBLISHED' }));
      await live.svc.archive('p1', 3, ACTOR);
      expect(live.prisma.contentPost.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'ARCHIVED', publishedData: Prisma.DbNull });

      const archived = setup(makePost({ status: 'ARCHIVED' }));
      await archived.svc.restore('p1', 3, ACTOR);
      expect(archived.prisma.contentPost.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'DRAFT' });
      expect(archived.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'PostRestored' }));
    });

    it('refuses transitions that do not apply', async () => {
      expect(body(await caught(setup().svc.unpublish('p1', 3, ACTOR))).code).toBe('NOT_PUBLISHED');
      expect(body(await caught(setup().svc.restore('p1', 3, ACTOR))).code).toBe('NOT_ARCHIVED');
      expect(body(await caught(setup(makePost({ status: 'ARCHIVED' })).svc.publish('p1', 3, ACTOR))).code).toBe('ARCHIVED');
    });
  });

  describe('delete', () => {
    it('permanently deletes an archived post and audit-logs what it was', async () => {
      const { prisma, audit, svc } = setup(makePost({ status: 'ARCHIVED' }));
      await expect(svc.remove('p1', ACTOR)).resolves.toEqual({ id: 'p1', deleted: true });

      expect(prisma.contentPost.deleteMany).toHaveBeenCalledWith({ where: { id: 'p1', status: 'ARCHIVED' } });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PostDeleted',
          oldValue: expect.objectContaining({ slug: 'choosing-hvls-fan-size', website: 'SPYRO' }),
        }),
      );
    });

    it('refuses drafts and published posts without deleting', async () => {
      for (const status of ['DRAFT', 'PUBLISHED']) {
        const { prisma, svc } = setup(makePost({ status }));
        const error = await caught(svc.remove('p1', ACTOR));
        expect(error).toBeInstanceOf(ConflictException);
        expect(body(error).code).toBe('NOT_ARCHIVED');
        expect(prisma.contentPost.deleteMany).not.toHaveBeenCalled();
      }
    });

    it('loses cleanly to a restore that happened in between', async () => {
      const { prisma, audit, svc } = setup(makePost({ status: 'ARCHIVED' }));
      prisma.contentPost.deleteMany.mockResolvedValue({ count: 0 });
      expect(body(await caught(svc.remove('p1', ACTOR))).code).toBe('NOT_ARCHIVED');
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  it('an audit-log failure never fails the action', async () => {
    const { audit, svc } = setup(makePost({ status: 'PUBLISHED' }));
    audit.record.mockRejectedValue(new Error('audit table down'));
    jest.spyOn((svc as any).logger, 'error').mockImplementation(() => undefined);
    await expect(svc.unpublish('p1', 3, ACTOR)).resolves.toBeDefined();
  });

  it('image upload checks the website exists, then delegates to the media service', async () => {
    const { prisma, media, svc } = setup();
    const file = { buffer: Buffer.from([0xff, 0xd8, 0xff]) } as Express.Multer.File;
    await svc.uploadImage('w1', file, ACTOR);
    expect(media.upload).toHaveBeenCalledWith({ id: 'w1', code: 'SPYRO' }, file, 'Divya');

    prisma.formWebsite.findUnique.mockResolvedValue(null);
    expect((await caught(svc.uploadImage('nope', file, ACTOR))).getStatus()).toBe(404);
  });

  describe('list', () => {
    it('scopes to one website and sorts with an id tie-breaker', async () => {
      const { prisma, svc } = setup();
      await svc.findAll({ formWebsiteId: 'w1', type: 'BLOG', sort: 'published_desc', page: 2, limit: 10 });

      const args = prisma.contentPost.findMany.mock.calls[0][0];
      expect(args.where).toMatchObject({ formWebsiteId: 'w1', type: 'BLOG', status: { not: 'ARCHIVED' } });
      expect(args.orderBy).toEqual([{ publishedAt: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }]);
      expect(args).toMatchObject({ skip: 10, take: 10 });
      expect(prisma.contentPost.count.mock.calls[0][0].where).toEqual(args.where);
    });

    it.each([
      ['updated_desc', [{ updatedAt: 'desc' }, { id: 'asc' }]],
      ['published_asc', [{ publishedAt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }]],
      ['title_asc', [{ title: 'asc' }, { id: 'asc' }]],
      ['title_desc', [{ title: 'desc' }, { id: 'asc' }]],
    ] as const)('sort %s', async (sort, orderBy) => {
      const { prisma, svc } = setup();
      await svc.findAll({ sort });
      expect(prisma.contentPost.findMany.mock.calls[0][0].orderBy).toEqual(orderBy);
    });

    it('defaults to last updated', async () => {
      const { prisma, svc } = setup();
      await svc.findAll({});
      expect(prisma.contentPost.findMany.mock.calls[0][0].orderBy).toEqual([{ updatedAt: 'desc' }, { id: 'asc' }]);
    });

    it('"unpublished changes" means live posts with pending edits', async () => {
      const { prisma, svc } = setup();
      await svc.findAll({ hasUnpublishedChanges: true, status: 'DRAFT' });
      expect(prisma.contentPost.findMany.mock.calls[0][0].where).toMatchObject({ status: 'PUBLISHED', hasUnpublishedChanges: true });
    });

    it('returns the cover image (with url) instead of the template data', async () => {
      process.env.CONTENT_MEDIA_PUBLIC_BASE_URL = 'https://media.example.com';
      const { prisma, svc } = setup();
      prisma.contentPost.findMany.mockResolvedValue([{ id: 'p1', title: 'T', data: blogData }]);
      const result = await svc.findAll({});
      delete process.env.CONTENT_MEDIA_PUBLIC_BASE_URL;
      expect(result.data[0]).not.toHaveProperty('data');
      expect(result.data[0].coverImage).toEqual({ key: KEY, alt: 'Fans in a warehouse', url: `https://media.example.com/${KEY}` });
    });

    it('counts per status tab with the same filters, ignoring status', async () => {
      const { prisma, svc } = setup();
      prisma.contentPost.groupBy.mockResolvedValue([
        { status: 'DRAFT', _count: { _all: 3 } },
        { status: 'PUBLISHED', _count: { _all: 5 } },
        { status: 'ARCHIVED', _count: { _all: 1 } },
      ]);
      prisma.contentPost.count.mockResolvedValue(2);
      const counts = await svc.countByStatus({ formWebsiteId: 'w1', type: 'BLOG', status: 'DRAFT', search: 'fan' });

      expect(counts).toEqual({ all: 8, draft: 3, published: 5, unpublishedChanges: 2, archived: 1 });
      const where = prisma.contentPost.groupBy.mock.calls[0][0].where;
      expect(where).toMatchObject({ formWebsiteId: 'w1', type: 'BLOG' });
      expect(where).not.toHaveProperty('status');
      expect(prisma.contentPost.count.mock.calls[0][0].where).toMatchObject({ formWebsiteId: 'w1', status: 'PUBLISHED', hasUnpublishedChanges: true });
    });
  });

  it('a missing post is a 404', async () => {
    const error = await caught(setup(null).svc.findOne('missing'));
    expect(error.getStatus()).toBe(404);
  });
});
