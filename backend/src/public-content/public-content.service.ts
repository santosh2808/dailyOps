import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ContentPostStatus, ContentPostType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from '../content/content.constants';
import { withMediaUrls } from '../content/content-media';
import { QueryPublicContentDto } from './dto/query-public-content.dto';

// Card fields
const CARD_FIELDS: Record<ContentPostType, string[]> = {
  BLOG: ['type', 'slug', 'title', 'excerpt', 'coverImage', 'category', 'tags', 'byline', 'date', 'readMinutes', 'featured', 'publishedAt', 'updatedAt'],
  CASE_STUDY: [
    'type', 'slug', 'title', 'excerpt', 'coverImage', 'industry', 'industryOther', 'city', 'state', 'clientName', 'anonymousClientLabel',
    'keyResults', 'areaSqFt', 'completedAt', 'featured', 'publishedAt', 'updatedAt',
  ],
};

// Public content reads
@Injectable()
export class PublicContentService {
  constructor(private prisma: PrismaService) {}

  async listPosts(publicFormKey: string, query: QueryPublicContentDto) {
    const websiteId = await this.resolveWebsiteId(publicFormKey);
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;

    const where: Prisma.ContentPostWhereInput = {
      formWebsiteId: websiteId,
      status: ContentPostStatus.PUBLISHED,
      ...(query.type ? { type: query.type } : {}),
      ...(query.featured !== undefined ? { featured: query.featured } : {}),
      AND: [
        ...(query.category ? [{ publishedData: { path: ['category'], equals: query.category } }] : []),
        ...(query.industry ? [{ publishedData: { path: ['industry'], equals: query.industry } }] : []),
      ],
    };

    const [rows, total] = await Promise.all([
      this.prisma.contentPost.findMany({
        where,
        select: { type: true, publishedData: true },
        // Featured, newest, stable
        orderBy: [{ featured: 'desc' }, { publishedAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.contentPost.count({ where }),
    ]);

    const data = rows.map((row) => withMediaUrls(toCard(row.type, row.publishedData)));
    return { data, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  async getPost(publicFormKey: string, slug: string) {
    const websiteId = await this.resolveWebsiteId(publicFormKey);
    if (!SLUG_PATTERN.test(slug) || slug.length > SLUG_MAX_LENGTH) {
      throw this.postNotFound();
    }
    const post = await this.prisma.contentPost.findFirst({
      where: { formWebsiteId: websiteId, slug, status: ContentPostStatus.PUBLISHED },
      select: { publishedData: true },
    });
    if (!post?.publishedData) {
      throw this.postNotFound();
    }
    return withMediaUrls(post.publishedData);
  }

  // Resolve website
  private async resolveWebsiteId(publicFormKey: string): Promise<string> {
    const form = await this.prisma.formDefinition.findUnique({
      where: { publicFormKey },
      select: { formWebsite: { select: { id: true, status: true } } },
    });
    if (!form) {
      throw new NotFoundException({ code: 'WEBSITE_NOT_FOUND', message: 'Website not found' });
    }
    if (form.formWebsite.status !== 'ACTIVE') {
      throw new BadRequestException({ code: 'WEBSITE_INACTIVE', message: 'This website is currently inactive' });
    }
    return form.formWebsite.id;
  }

  private postNotFound() {
    return new NotFoundException({ code: 'POST_NOT_FOUND', message: 'Post not found' });
  }
}

function toCard(type: ContentPostType, snapshot: Prisma.JsonValue): Record<string, unknown> {
  const source = (snapshot ?? {}) as Record<string, unknown>;
  const card: Record<string, unknown> = {};
  for (const name of CARD_FIELDS[type]) {
    if (source[name] !== undefined) card[name] = source[name];
  }
  return card;
}
