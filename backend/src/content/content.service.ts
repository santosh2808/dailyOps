import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ContentPostStatus, ContentPostType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { FieldValidationError } from '../public-forms/form-schema-validator.service';
import { CONTENT_TIME_ZONE_OFFSET, DEFAULT_BLOG_BYLINE, type ContentPostSort } from './content.constants';
import { FOREIGN_ARTICLE_IMAGE_MESSAGE, FOREIGN_IMAGE_MESSAGE, withMediaUrls } from './content-media';
import { ContentMediaService } from './content-media.service';
import { readMinutes } from './rich-text';
import { ContentTemplateValidatorService } from './content-template-validator.service';
import { CreateContentPostDto } from './dto/create-content-post.dto';
import { UpdateContentPostDto } from './dto/update-content-post.dto';
import { QueryContentPostDto } from './dto/query-content-post.dto';
import { ContentPostProductDto } from './dto/content-post-product.dto';

const USER_SELECT = { select: { id: true, name: true } } as const;

const POST_INCLUDE = {
  formWebsite: { select: { id: true, code: true, name: true, status: true, siteUrl: true } },
  author: USER_SELECT,
  updatedBy: USER_SELECT,
  products: {
    orderBy: { displayOrder: 'asc' as const },
    include: {
      formWebsiteProduct: {
        select: { id: true, publicCode: true, label: true, enabled: true, product: { select: { id: true, name: true, fanType: true } } },
      },
    },
  },
} satisfies Prisma.ContentPostInclude;

// List row fields
const LIST_SELECT = {
  id: true,
  formWebsiteId: true,
  formWebsite: { select: { id: true, code: true, name: true, siteUrl: true } },
  type: true,
  slug: true,
  title: true,
  status: true,
  featured: true,
  hasUnpublishedChanges: true,
  version: true,
  author: USER_SELECT,
  updatedBy: USER_SELECT,
  publishedAt: true,
  lastPublishedAt: true,
  createdAt: true,
  updatedAt: true,
  data: true, // cover only
} satisfies Prisma.ContentPostSelect;

// Stable sort
const LIST_ORDER: Record<ContentPostSort, Prisma.ContentPostOrderByWithRelationInput[]> = {
  updated_desc: [{ updatedAt: 'desc' }, { id: 'asc' }],
  published_desc: [{ publishedAt: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
  published_asc: [{ publishedAt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
  title_asc: [{ title: 'asc' }, { id: 'asc' }],
  title_desc: [{ title: 'desc' }, { id: 'asc' }],
};

type PostWithRelations = Prisma.ContentPostGetPayload<{ include: typeof POST_INCLUDE }>;

export interface ContentActor {
  id: string;
  name: string;
}

// Version mismatch
class StaleWriteError extends Error {}

// Content admin service
@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  constructor(
    private prisma: PrismaService,
    private auditLogService: AuditLogService,
    private templateValidator: ContentTemplateValidatorService,
    private contentMediaService: ContentMediaService,
  ) {}

  // -------------------------------------------------------------------
  // Lookups
  // -------------------------------------------------------------------

  listWebsites() {
    return this.prisma.formWebsite.findMany({
      select: { id: true, code: true, name: true, status: true, siteUrl: true },
      orderBy: { name: 'asc' },
    });
  }

  // Enabled product mappings
  async listProductOptions(websiteId: string) {
    await this.findWebsiteOrThrow(websiteId);
    return this.prisma.formWebsiteProduct.findMany({
      where: { formWebsiteId: websiteId, enabled: true },
      select: { id: true, publicCode: true, label: true, product: { select: { id: true, name: true } } },
      orderBy: [{ displayOrder: 'asc' }, { label: 'asc' }],
    });
  }

  // Upload one image
  async uploadImage(websiteId: string, file: Express.Multer.File | undefined, actor: ContentActor) {
    const website = await this.findWebsiteOrThrow(websiteId);
    return this.contentMediaService.upload(website, file, actor.name);
  }

  // -------------------------------------------------------------------
  // Posts
  // -------------------------------------------------------------------

  async findAll(query: QueryContentPostDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const base = this.baseWhere(query);
    const where: Prisma.ContentPostWhereInput = query.hasUnpublishedChanges
      ? { ...base, status: ContentPostStatus.PUBLISHED, hasUnpublishedChanges: true }
      : { ...base, status: query.status ?? { not: ContentPostStatus.ARCHIVED } };

    const [rows, total] = await Promise.all([
      this.prisma.contentPost.findMany({
        where,
        select: LIST_SELECT,
        orderBy: LIST_ORDER[query.sort ?? 'updated_desc'],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.contentPost.count({ where }),
    ]);

    const data = rows.map(({ data: postData, ...row }) => ({
      ...row,
      coverImage: withMediaUrls((postData as { coverImage?: unknown } | null)?.coverImage ?? null),
    }));
    return { data, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  // Status tab counts
  async countByStatus(query: QueryContentPostDto) {
    const base = this.baseWhere(query);
    const [groups, unpublishedChanges] = await Promise.all([
      this.prisma.contentPost.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      this.prisma.contentPost.count({ where: { ...base, status: ContentPostStatus.PUBLISHED, hasUnpublishedChanges: true } }),
    ]);
    const countOf = (status: ContentPostStatus) => groups.find((g) => g.status === status)?._count._all ?? 0;
    const draft = countOf(ContentPostStatus.DRAFT);
    const published = countOf(ContentPostStatus.PUBLISHED);
    return { all: draft + published, draft, published, unpublishedChanges, archived: countOf(ContentPostStatus.ARCHIVED) };
  }

  async findOne(id: string) {
    return this.toResponse(await this.findPostOrThrow(id));
  }

  async create(dto: CreateContentPostDto, actor: ContentActor) {
    const website = await this.findWebsiteOrThrow(dto.formWebsiteId);
    const title = dto.title.trim();

    const template = this.templateValidator.validate(dto.type, dto.data, { websiteCode: website.code, forPublish: false });
    const errors = [...template.errors, ...(await this.checkProducts(dto.type, website.id, dto.products))];
    if (!title) errors.unshift({ field: 'title', message: 'Title is required' });
    if (errors.length) throw this.validationFailed(errors);

    let created: PostWithRelations;
    try {
      created = await this.prisma.contentPost.create({
        data: {
          formWebsiteId: website.id,
          type: dto.type,
          slug: dto.slug,
          title,
          featured: dto.featured ?? false,
          seoTitle: blankToNull(dto.seoTitle),
          seoDescription: blankToNull(dto.seoDescription),
          data: template.value as Prisma.InputJsonValue,
          authorId: actor.id,
          updatedById: actor.id,
          products: { create: productRows(dto.products) },
        },
        include: POST_INCLUDE,
      });
    } catch (error) {
      if (this.isUniqueConflict(error)) throw this.slugTaken();
      throw error;
    }

    await this.audit(created.id, 'PostCreated', actor, null, {
      type: created.type,
      slug: created.slug,
      title: created.title,
      website: website.code,
    });

    return this.toResponse(created);
  }

  async update(id: string, dto: UpdateContentPostDto, actor: ContentActor) {
    const existing = await this.findPostOrThrow(id);
    if (existing.status === ContentPostStatus.ARCHIVED) {
      throw new ConflictException({ code: 'ARCHIVED', message: 'This post is archived. Restore it before editing.' });
    }
    this.assertVersion(existing, dto.version);

    const slugChanged = dto.slug !== undefined && dto.slug !== existing.slug;
    if (slugChanged && existing.status === ContentPostStatus.PUBLISHED) {
      throw new ConflictException({
        code: 'SLUG_LOCKED',
        message: 'Unpublish this post before changing its URL name, so existing links do not break.',
      });
    }

    const websiteChanged = dto.formWebsiteId !== undefined && dto.formWebsiteId !== existing.formWebsiteId;
    if (websiteChanged && existing.status === ContentPostStatus.PUBLISHED) {
      throw new ConflictException({
        code: 'WEBSITE_LOCKED',
        message: 'Unpublish this post before moving it to another website.',
      });
    }
    const website = websiteChanged ? await this.findWebsiteOrThrow(dto.formWebsiteId as string) : existing.formWebsite;

    const errors: FieldValidationError[] = [];
    const title = dto.title?.trim();
    if (dto.title !== undefined && !title) errors.push({ field: 'title', message: 'Title cannot be blank' });

    // Website changed
    let data: Prisma.InputJsonValue | undefined;
    if (dto.data !== undefined || websiteChanged) {
      const template = this.templateValidator.validate(existing.type, dto.data ?? existing.data, {
        websiteCode: website.code,
        forPublish: false,
      });
      errors.push(...(websiteChanged ? this.movedImageErrors(template.errors, existing.formWebsite.code, website.code) : template.errors));
      data = template.value as Prisma.InputJsonValue;
    }
    const products = dto.products ?? (websiteChanged ? existing.products.map(productDto) : undefined);
    errors.push(...(await this.checkProducts(existing.type, website.id, products)));
    if (errors.length) throw this.validationFailed(errors);

    const changedFields = Object.keys(dto).filter((name) => name !== 'version');

    try {
      await this.prisma.$transaction(async (tx) => {
        const result = await tx.contentPost.updateMany({
          where: { id, version: dto.version },
          data: {
            formWebsiteId: websiteChanged ? website.id : undefined,
            title,
            slug: dto.slug,
            featured: dto.featured,
            seoTitle: dto.seoTitle === undefined ? undefined : blankToNull(dto.seoTitle),
            seoDescription: dto.seoDescription === undefined ? undefined : blankToNull(dto.seoDescription),
            data,
            // Live copy untouched
            hasUnpublishedChanges: existing.status === ContentPostStatus.PUBLISHED,
            updatedById: actor.id,
            version: { increment: 1 },
          },
        });
        if (result.count === 0) throw new StaleWriteError();

        if (dto.products !== undefined) {
          await tx.contentPostProduct.deleteMany({ where: { contentPostId: id } });
          await tx.contentPostProduct.createMany({
            data: productRows(dto.products).map((row) => ({ ...row, contentPostId: id })),
          });
        }
      });
    } catch (error) {
      if (error instanceof StaleWriteError) throw await this.staleConflict(id);
      if (this.isUniqueConflict(error)) throw this.slugTaken();
      throw error;
    }

    await this.audit(
      id,
      'PostUpdated',
      actor,
      { version: existing.version, slug: existing.slug, ...(websiteChanged ? { website: existing.formWebsite.code } : {}) },
      {
        version: existing.version + 1,
        slug: dto.slug ?? existing.slug,
        ...(websiteChanged ? { website: website.code } : {}),
        changedFields,
      },
    );

    return this.findOne(id);
  }

  // Publish or update
  async publish(id: string, version: number, actor: ContentActor) {
    const post = await this.findPostOrThrow(id);
    if (post.status === ContentPostStatus.ARCHIVED) {
      throw new ConflictException({ code: 'ARCHIVED', message: 'This post is archived. Restore it before publishing.' });
    }
    this.assertVersion(post, version);

    const template = this.templateValidator.validate(post.type, post.data, {
      websiteCode: post.formWebsite.code,
      forPublish: true,
    });
    const errors = [...template.errors, ...this.checkStoredProductsForPublish(post)];
    if (errors.length) throw this.validationFailed(errors);

    const now = new Date();
    const blogDate = post.type === ContentPostType.BLOG ? (template.value.date as string | undefined) : undefined;
    // Keep first-publish date
    const publishedAt = blogDate ? new Date(`${blogDate}T00:00:00${CONTENT_TIME_ZONE_OFFSET}`) : post.publishedAt ?? now;
    const snapshot = this.buildSnapshot(post, template.value, template.bodyText, publishedAt, now);
    const wasPublished = post.status === ContentPostStatus.PUBLISHED;

    await this.guardedWrite(id, version, {
      status: ContentPostStatus.PUBLISHED,
      publishedData: snapshot as Prisma.InputJsonValue,
      hasUnpublishedChanges: false,
      publishedAt,
      lastPublishedAt: now,
      updatedById: actor.id,
    });

    await this.audit(id, wasPublished ? 'PostLiveUpdated' : 'PostPublished', actor, { status: post.status }, {
      status: ContentPostStatus.PUBLISHED,
      slug: post.slug,
      version: version + 1,
    });

    return this.findOne(id);
  }

  // Back to draft
  async unpublish(id: string, version: number, actor: ContentActor) {
    const post = await this.findPostOrThrow(id);
    if (post.status !== ContentPostStatus.PUBLISHED) {
      throw new ConflictException({ code: 'NOT_PUBLISHED', message: 'This post is not published.' });
    }
    this.assertVersion(post, version);

    await this.guardedWrite(id, version, {
      status: ContentPostStatus.DRAFT,
      publishedData: Prisma.DbNull,
      hasUnpublishedChanges: false,
      updatedById: actor.id,
    });
    await this.audit(id, 'PostUnpublished', actor, { status: post.status }, { status: ContentPostStatus.DRAFT, version: version + 1 });

    return this.findOne(id);
  }

  // Soft delete
  async archive(id: string, version: number, actor: ContentActor) {
    const post = await this.findPostOrThrow(id);
    if (post.status === ContentPostStatus.ARCHIVED) {
      throw new ConflictException({ code: 'ARCHIVED', message: 'This post is already archived.' });
    }
    this.assertVersion(post, version);

    await this.guardedWrite(id, version, {
      status: ContentPostStatus.ARCHIVED,
      publishedData: Prisma.DbNull,
      hasUnpublishedChanges: false,
      updatedById: actor.id,
    });
    await this.audit(id, 'PostArchived', actor, { status: post.status }, { status: ContentPostStatus.ARCHIVED, version: version + 1 });

    return this.findOne(id);
  }

  // Archived to draft
  async restore(id: string, version: number, actor: ContentActor) {
    const post = await this.findPostOrThrow(id);
    if (post.status !== ContentPostStatus.ARCHIVED) {
      throw new ConflictException({ code: 'NOT_ARCHIVED', message: 'This post is not archived.' });
    }
    this.assertVersion(post, version);

    await this.guardedWrite(id, version, { status: ContentPostStatus.DRAFT, updatedById: actor.id });
    await this.audit(id, 'PostRestored', actor, { status: post.status }, { status: ContentPostStatus.DRAFT, version: version + 1 });

    return this.findOne(id);
  }

  // Hard delete
  async remove(id: string, actor: ContentActor) {
    const post = await this.findPostOrThrow(id);
    if (post.status !== ContentPostStatus.ARCHIVED) {
      throw new ConflictException({ code: 'NOT_ARCHIVED', message: 'Archive this post before deleting it.' });
    }

    // Atomic delete
    const result = await this.prisma.contentPost.deleteMany({ where: { id, status: ContentPostStatus.ARCHIVED } });
    if (result.count === 0) {
      throw new ConflictException({ code: 'NOT_ARCHIVED', message: 'This post was just restored by someone else. Reload to see it.' });
    }

    await this.audit(
      id,
      'PostDeleted',
      actor,
      { type: post.type, slug: post.slug, title: post.title, website: post.formWebsite.code, status: post.status },
      { deleted: true },
    );
    return { id, deleted: true };
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  // Filters except status
  private baseWhere(query: QueryContentPostDto): Prisma.ContentPostWhereInput {
    const search = query.search?.trim();
    return {
      ...(query.formWebsiteId ? { formWebsiteId: query.formWebsiteId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.featured !== undefined ? { featured: query.featured } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { slug: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
      AND: [
        ...(query.category ? [{ data: { path: ['category'], equals: query.category } }] : []),
        ...(query.industry ? [{ data: { path: ['industry'], equals: query.industry } }] : []),
      ],
    };
  }

  private async findWebsiteOrThrow(id: string) {
    const website = await this.prisma.formWebsite.findUnique({ where: { id }, select: { id: true, code: true } });
    if (!website) {
      throw new NotFoundException('Website not found');
    }
    return website;
  }

  private async findPostOrThrow(id: string): Promise<PostWithRelations> {
    const post = await this.prisma.contentPost.findUnique({ where: { id }, include: POST_INCLUDE });
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    return post;
  }

  private assertVersion(post: PostWithRelations, version: number) {
    if (post.version !== version) {
      throw this.staleBody(post);
    }
  }

  private async guardedWrite(id: string, version: number, data: Prisma.ContentPostUncheckedUpdateManyInput) {
    const result = await this.prisma.contentPost.updateMany({
      where: { id, version },
      data: { ...data, version: { increment: 1 } },
    });
    if (result.count === 0) {
      throw await this.staleConflict(id);
    }
  }

  private async staleConflict(id: string) {
    const current = await this.prisma.contentPost.findUnique({ where: { id }, include: POST_INCLUDE });
    if (!current) {
      return new NotFoundException('Post not found');
    }
    return this.staleBody(current);
  }

  private staleBody(current: PostWithRelations) {
    return new ConflictException({
      code: 'STALE',
      message: `${current.updatedBy?.name ?? 'Someone'} changed this post after you opened it. Reload to see their changes.`,
      current: { version: current.version, updatedAt: current.updatedAt, updatedBy: current.updatedBy },
    });
  }

  // Validate products used
  private async checkProducts(
    type: ContentPostType,
    websiteId: string,
    products: ContentPostProductDto[] | undefined,
  ): Promise<FieldValidationError[]> {
    if (!products?.length) return [];
    if (type !== ContentPostType.CASE_STUDY) {
      return [{ field: 'products', message: 'Only case studies list products used' }];
    }

    const errors: FieldValidationError[] = [];
    const ids = products.map((p) => p.formWebsiteProductId);
    const mappings = await this.prisma.formWebsiteProduct.findMany({
      where: { id: { in: ids }, formWebsiteId: websiteId },
      select: { id: true, enabled: true },
    });
    const byId = new Map(mappings.map((m) => [m.id, m]));
    const seen = new Set<string>();
    products.forEach((product, index) => {
      const field = `products.${index}.formWebsiteProductId`;
      const mapping = byId.get(product.formWebsiteProductId);
      if (seen.has(product.formWebsiteProductId)) {
        errors.push({ field, message: 'This product is listed twice' });
      } else if (!mapping) {
        errors.push({ field, message: 'Not a product of this website' });
      } else if (!mapping.enabled) {
        errors.push({ field, message: 'This product is disabled for this website' });
      }
      seen.add(product.formWebsiteProductId);
    });
    return errors;
  }

  // Recheck products
  private checkStoredProductsForPublish(post: PostWithRelations): FieldValidationError[] {
    if (post.type !== ContentPostType.CASE_STUDY) return [];
    if (post.products.length === 0) {
      return [{ field: 'products', message: 'Add at least one product used to publish' }];
    }
    return post.products
      .map((row, index) =>
        row.formWebsiteProduct.enabled
          ? null
          : { field: `products.${index}.formWebsiteProductId`, message: `${row.formWebsiteProduct.label} is disabled for this website` },
      )
      .filter((error): error is FieldValidationError => error !== null);
  }

  // Public snapshot
  private buildSnapshot(
    post: PostWithRelations,
    data: Record<string, unknown>,
    bodyText: string,
    publishedAt: Date,
    now: Date,
  ): Record<string, unknown> {
    const common = {
      type: post.type,
      slug: post.slug,
      title: post.title,
      featured: post.featured,
      seoTitle: post.seoTitle,
      seoDescription: post.seoDescription,
      publishedAt: publishedAt.toISOString(),
      updatedAt: now.toISOString(),
    };
    if (post.type === ContentPostType.BLOG) {
      return {
        ...data,
        ...common,
        byline: (data.byline as string | undefined) ?? DEFAULT_BLOG_BYLINE,
        date: (data.date as string | undefined) ?? indiaDay(publishedAt),
        readMinutes: readMinutes(bodyText),
      };
    }
    return {
      ...data,
      ...common,
      products: post.products.map((row) => ({
        publicCode: row.formWebsiteProduct.publicCode,
        label: row.formWebsiteProduct.label,
        fanType: row.formWebsiteProduct.product.fanType, // ROOF/FLOOR/POLE or null
        quantity: row.quantity,
      })),
    };
  }

  private toResponse(post: PostWithRelations) {
    const { publishedData: _publishedData, ...rest } = post;
    return { ...rest, data: withMediaUrls(post.data) };
  }

  private validationFailed(errors: FieldValidationError[]) {
    return new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Some fields need attention', errors });
  }

  // Old website images
  private movedImageErrors(errors: FieldValidationError[], from: string, to: string): FieldValidationError[] {
    return errors.map((error) =>
      error.message === FOREIGN_IMAGE_MESSAGE || error.message === FOREIGN_ARTICLE_IMAGE_MESSAGE
        ? { ...error, message: `Uploaded for ${from}. Remove it and upload it again for ${to}.` }
        : error,
    );
  }

  private slugTaken() {
    return new ConflictException({
      code: 'SLUG_TAKEN',
      message: 'A post with this URL name already exists on this website. Choose another URL name.',
    });
  }

  private async audit(
    recordId: string,
    action: string,
    actor: ContentActor,
    oldValue: Record<string, unknown> | null,
    newValue: Record<string, unknown>,
  ) {
    await this.auditLogService
      .record({ module: 'Content', recordId, action, actorName: actor.name, oldValue, newValue })
      .catch((error) => this.logger.error('AuditLog record failed', error));
  }

  private isUniqueConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function productRows(products: ContentPostProductDto[] | undefined) {
  return (products ?? []).map((product, index) => ({
    formWebsiteProductId: product.formWebsiteProductId,
    quantity: product.quantity,
    displayOrder: index,
  }));
}

// Row to DTO
function productDto(row: { formWebsiteProductId: string; quantity: number }): ContentPostProductDto {
  return { formWebsiteProductId: row.formWebsiteProductId, quantity: row.quantity };
}

// India-time date
function indiaDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
