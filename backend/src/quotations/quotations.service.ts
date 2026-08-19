import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';
import { UpdateQuotationStatusDto } from './dto/update-quotation-status.dto';
import { QueryQuotationDto } from './dto/query-quotation.dto';
import { QuotationItemInputDto } from './dto/quotation-item-input.dto';

const QUOTATION_NUMBER_PREFIX = 'QT-';
const QUOTATION_NUMBER_PAD = 6;
const MAX_QUOTATION_NUMBER_ATTEMPTS = 5;
const DEFAULT_GST_PERCENT = 18;

// Whitelisted so `sortBy` from the query string can never be used to sort by
// an arbitrary/unindexed or sensitive column.
const SORTABLE_FIELDS = [
  'createdAt',
  'updatedAt',
  'quotationNumber',
  'grandTotal',
  'validUntil',
  'status',
] as const;

const QUOTATION_DETAIL_INCLUDE = {
  customer: true,
  items: { include: { product: true } },
} satisfies Prisma.QuotationInclude;

const QUOTATION_LIST_INCLUDE = {
  customer: true,
  _count: { select: { items: true } },
} satisfies Prisma.QuotationInclude;

interface ComputedItem {
  productId: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface ComputedTotals {
  items: ComputedItem[];
  subtotal: number;
  gstPercent: number;
  gstAmount: number;
  grandTotal: number;
}

@Injectable()
export class QuotationsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: QueryQuotationDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();

    const where: Prisma.QuotationWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { quotationNumber: { contains: search, mode: 'insensitive' } },
              { customer: { companyName: { contains: search, mode: 'insensitive' } } },
              { customer: { contactPerson: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const sortBy = SORTABLE_FIELDS.includes(query.sortBy as (typeof SORTABLE_FIELDS)[number])
      ? (query.sortBy as (typeof SORTABLE_FIELDS)[number])
      : 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

    const [data, total] = await Promise.all([
      this.prisma.quotation.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
        include: QUOTATION_LIST_INCLUDE,
      }),
      this.prisma.quotation.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findOne(id: string) {
    // Matches the Lead convention: a direct lookup by id still returns the
    // record even if it has been soft-deleted; only the list endpoint hides
    // it by default.
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: QUOTATION_DETAIL_INCLUDE,
    });
    if (!quotation) {
      throw new NotFoundException('Quotation not found');
    }
    return quotation;
  }

  async create(dto: CreateQuotationDto) {
    const totals = await this.computeTotals(dto.items, dto.gstPercent);

    for (let attempt = 1; attempt <= MAX_QUOTATION_NUMBER_ATTEMPTS; attempt++) {
      const quotationNumber = await this.generateQuotationNumber();
      try {
        return await this.prisma.quotation.create({
          data: {
            quotationNumber,
            customerId: dto.customerId,
            status: dto.status,
            subtotal: totals.subtotal,
            gstPercent: totals.gstPercent,
            gstAmount: totals.gstAmount,
            grandTotal: totals.grandTotal,
            validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
            notes: dto.notes,
            terms: dto.terms,
            items: { create: totals.items },
          },
          include: QUOTATION_DETAIL_INCLUDE,
        });
      } catch (error) {
        if (this.isQuotationNumberConflict(error) && attempt < MAX_QUOTATION_NUMBER_ATTEMPTS) {
          continue; // Another request took this number first — retry with a fresh one.
        }
        throw error;
      }
    }

    // Unreachable, but keeps TypeScript satisfied about the return type.
    throw new Error('Failed to generate a unique quotation number');
  }

  async update(id: string, dto: UpdateQuotationDto) {
    const existing = await this.findOne(id);

    // Recompute totals whenever items and/or gstPercent are touched. If
    // neither is supplied, keep the existing stored totals untouched.
    const shouldRecompute = dto.items !== undefined || dto.gstPercent !== undefined;
    const totals = shouldRecompute
      ? await this.computeTotals(
          dto.items ?? this.toItemInput(existing.items),
          dto.gstPercent ?? existing.gstPercent,
        )
      : null;

    return this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        await tx.quotationItem.deleteMany({ where: { quotationId: id } });
      }

      return tx.quotation.update({
        where: { id },
        data: {
          customerId: dto.customerId,
          status: dto.status,
          validUntil:
            dto.validUntil !== undefined
              ? dto.validUntil
                ? new Date(dto.validUntil)
                : null
              : undefined,
          notes: dto.notes,
          terms: dto.terms,
          ...(totals
            ? {
                subtotal: totals.subtotal,
                gstPercent: totals.gstPercent,
                gstAmount: totals.gstAmount,
                grandTotal: totals.grandTotal,
              }
            : {}),
          ...(dto.items ? { items: { create: totals!.items } } : {}),
        },
        include: QUOTATION_DETAIL_INCLUDE,
      });
    });
  }

  async updateStatus(id: string, dto: UpdateQuotationStatusDto) {
    await this.findOne(id);
    return this.prisma.quotation.update({
      where: { id },
      data: { status: dto.status },
      include: QUOTATION_DETAIL_INCLUDE,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.quotation.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private toItemInput(
    items: { productId: string; description?: string | null; quantity: number; unitPrice: number }[],
  ): QuotationItemInputDto[] {
    return items.map((item) => ({
      productId: item.productId,
      description: item.description ?? undefined,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    }));
  }

  private async computeTotals(
    items: QuotationItemInputDto[],
    gstPercent?: number,
  ): Promise<ComputedTotals> {
    const productIds = [...new Set(items.map((i) => i.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const computedItems: ComputedItem[] = items.map((item) => {
      const unitPrice = item.unitPrice ?? productMap.get(item.productId)?.price ?? 0;
      const quantity = item.quantity;
      return {
        productId: item.productId,
        description: item.description,
        quantity,
        unitPrice,
        lineTotal: Math.round(quantity * unitPrice * 100) / 100,
      };
    });

    const subtotal = Math.round(computedItems.reduce((sum, i) => sum + i.lineTotal, 0) * 100) / 100;
    const effectiveGstPercent = gstPercent ?? DEFAULT_GST_PERCENT;
    const gstAmount = Math.round(subtotal * (effectiveGstPercent / 100) * 100) / 100;
    const grandTotal = Math.round((subtotal + gstAmount) * 100) / 100;

    return {
      items: computedItems,
      subtotal,
      gstPercent: effectiveGstPercent,
      gstAmount,
      grandTotal,
    };
  }

  private async generateQuotationNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const yearPrefix = `${QUOTATION_NUMBER_PREFIX}${year}-`;
    const last = await this.prisma.quotation.findFirst({
      where: { quotationNumber: { startsWith: yearPrefix } },
      orderBy: { quotationNumber: 'desc' },
      select: { quotationNumber: true },
    });
    const lastSeq = last ? parseInt(last.quotationNumber.replace(yearPrefix, ''), 10) || 0 : 0;
    return `${yearPrefix}${String(lastSeq + 1).padStart(QUOTATION_NUMBER_PAD, '0')}`;
  }

  private isQuotationNumberConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      Array.isArray(error.meta?.target) &&
      (error.meta?.target as string[]).includes('quotationNumber')
    );
  }
}
