import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';

// Feature upgrade: "Fan Type is missing when HVLS Fans category is
// selected" — case/whitespace-insensitive so "HVLS Fans", " hvls fans ",
// etc. all match the one canonical category string products are actually
// seeded/created with (see prisma/seed.ts).
function isHvlsFansCategory(category: string | null | undefined): boolean {
  return (category ?? '').trim().toLowerCase() === 'hvls fans';
}

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: QueryProductDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();
    const category = query.category?.trim();

    const status = query.status ?? 'ACTIVE';
    const where: Prisma.ProductWhereInput = {
      ...(status === 'ACTIVE' ? { isActive: true } : status === 'INACTIVE' ? { isActive: false } : {}),
      ...(category ? { category } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { category: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getCategories() {
    const rows = await this.prisma.product.findMany({
      where: { isActive: true },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });
    return rows.map((row) => row.category);
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  create(dto: CreateProductDto) {
    // Feature upgrade: Fan Type is mandatory for the HVLS Fans category —
    // enforced here (not just on the frontend) so the API itself can't be
    // used to create a fan product with no mounting type, the same
    // belt-and-suspenders approach as every other conditional-required
    // field in this codebase.
    if (isHvlsFansCategory(dto.category) && !dto.fanType) {
      throw new BadRequestException(
        'Fan Type is required for HVLS Fans products. Choose Roof, Floor, or Pole mounted.',
      );
    }
    // technicalSpec is a plain TS interface (ProductTechnicalSpec), not
    // Prisma's generated InputJsonValue — Prisma requires an explicit index
    // signature for JSON input types, which a named interface doesn't
    // structurally provide even though every field it holds really is
    // JSON-safe (strings and one array of plain objects). Cast just this
    // field rather than the whole dto, so everything else stays type-checked
    // normally.
    return this.prisma.product.create({
      data: { ...dto, technicalSpec: dto.technicalSpec as Prisma.InputJsonValue | undefined },
    });
  }

  async update(id: string, dto: UpdateProductDto) {
    const existing = await this.findOne(id);
    // Same rule as create() above, evaluated against the merged
    // category/fanType — a PATCH that only sends one of the two fields
    // must still be checked against whichever value (new or existing)
    // ends up actually stored.
    const effectiveCategory = dto.category !== undefined ? dto.category : existing.category;
    const effectiveFanType = dto.fanType !== undefined ? dto.fanType : existing.fanType;
    if (isHvlsFansCategory(effectiveCategory) && !effectiveFanType) {
      throw new BadRequestException(
        'Fan Type is required for HVLS Fans products. Choose Roof, Floor, or Pole mounted.',
      );
    }
    return this.prisma.product.update({
      where: { id },
      data: { ...dto, technicalSpec: dto.technicalSpec as Prisma.InputJsonValue | undefined },
    });
  }

  async reactivate(id: string) {
    await this.findOne(id);
    return this.prisma.product.update({
      where: { id },
      data: { isActive: true },
    });
  }

  async deactivate(id: string) {
    await this.findOne(id);
    return this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // Permanent delete — a separate action from deactivate() above (the
  // Deactivate button), offered only for a product nothing uses yet.
  // Leads, quotations, sales orders and tax invoices are business history,
  // and website form mappings/routing rules are live configuration, so any
  // reference blocks the delete with the reason; nothing cascades. Routing
  // rules matter here because their FK is ON DELETE SET NULL — the database
  // alone would silently drop the product from them.
  //
  // The row lock makes check-then-delete safe: inserting a row that
  // references this product needs a lock that conflicts with FOR UPDATE, so
  // nothing can start using it between the check and the delete.
  async hardDelete(id: string) {
    const product = await this.findOne(id);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Product" WHERE id = ${id} FOR UPDATE`;
        // Deleted by someone else since findOne() above (e.g. two admins
        // clicking Delete at once) — answer 404, not a 500 from delete().
        if (locked.length === 0) {
          throw new NotFoundException('Product not found');
        }
        // Sequential on purpose: an interactive transaction runs one query
        // at a time on its connection anyway. Line items are counted per
        // parent record ("2 quotations", not "3 quotation lines").
        const where = { productId: id };
        const countParents = async (rows: Promise<unknown[]>) => (await rows).length;
        const usage: [number, string, string][] = [
          [await countParents(tx.leadProduct.findMany({ where, distinct: ['leadId'], select: { leadId: true } })), 'lead', 'leads'],
          [
            await countParents(tx.quotationItem.findMany({ where, distinct: ['quotationId'], select: { quotationId: true } })),
            'quotation',
            'quotations',
          ],
          [
            await countParents(tx.salesOrderItem.findMany({ where, distinct: ['salesOrderId'], select: { salesOrderId: true } })),
            'sales order',
            'sales orders',
          ],
          [
            await countParents(tx.taxInvoiceItem.findMany({ where, distinct: ['taxInvoiceId'], select: { taxInvoiceId: true } })),
            'tax invoice',
            'tax invoices',
          ],
          [await tx.formWebsiteProduct.count({ where }), 'website form product mapping', 'website form product mappings'],
          [await tx.formSubjectRoute.count({ where }), 'website form routing rule', 'website form routing rules'],
        ];
        const uses = usage.filter(([n]) => n > 0).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);
        if (uses.length > 0) {
          throw new ConflictException(
            `"${product.name}" can't be permanently deleted because it is used in ${uses.join(', ')}. ` +
              'Deactivate it instead to hide it from new records.',
          );
        }
        return tx.product.delete({ where: { id } });
      });
    } catch (error) {
      // Backstop: a reference the check above doesn't know about yet still
      // fails safely at the database (ON DELETE RESTRICT).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException(
          `"${product.name}" can't be permanently deleted because other records still use it. ` +
            'Deactivate it instead to hide it from new records.',
        );
      }
      throw error;
    }
  }
}
