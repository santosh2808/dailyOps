import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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

    const where: Prisma.ProductWhereInput = {
      isActive: true,
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

  async deactivate(id: string) {
    await this.findOne(id);
    return this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
