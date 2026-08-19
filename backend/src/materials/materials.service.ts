import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { QueryMaterialDto } from './dto/query-material.dto';

// Column headers expected/produced in the Excel import/export file. Import
// resolves Category/Unit by name (not id) since spreadsheet users work with
// names, not UUIDs; export writes the same names back out for round-tripping.
const EXCEL_COLUMNS = [
  'materialCode',
  'name',
  'description',
  'category',
  'unit',
  'supplierId',
  'cost',
  'minimumStock',
  'maximumStock',
  'reorderLevel',
  'currentStock',
  'warehouseId',
  'isActive',
] as const;

export interface ImportRowResult {
  row: number;
  materialCode: string;
  status: 'created' | 'updated' | 'failed';
  error?: string;
}

@Injectable()
export class MaterialsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: QueryMaterialDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();

    const where: Prisma.MaterialWhereInput = {
      isActive: true,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.unitId ? { unitId: query.unitId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { materialCode: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.stockStatus === 'out_of_stock'
        ? { currentStock: { lte: 0 } }
        : {}),
      ...(query.stockStatus === 'low_stock'
        ? { currentStock: { gt: 0 } }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.material.findMany({
        where,
        include: { category: true, unit: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.material.count({ where }),
    ]);

    // "low_stock" additionally requires currentStock <= reorderLevel, which
    // Prisma cannot compare across two columns in a `where` filter directly.
    // Filtered in-memory on the already-paginated page, consistent with how
    // this field-to-field comparison is done for the dashboard counts below.
    const data =
      query.stockStatus === 'low_stock'
        ? rows.filter((row) => row.currentStock <= row.reorderLevel)
        : rows;

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findOne(id: string) {
    const material = await this.prisma.material.findUnique({
      where: { id },
      include: { category: true, unit: true },
    });
    if (!material) {
      throw new NotFoundException('Material not found');
    }
    return material;
  }

  private async assertCategoryAndUnitExist(categoryId: string, unitId: string) {
    const [category, unit] = await Promise.all([
      this.prisma.materialCategory.findUnique({ where: { id: categoryId } }),
      this.prisma.materialUnit.findUnique({ where: { id: unitId } }),
    ]);
    if (!category) {
      throw new BadRequestException('Category not found');
    }
    if (!unit) {
      throw new BadRequestException('Unit not found');
    }
  }

  async create(dto: CreateMaterialDto) {
    const existing = await this.prisma.material.findUnique({
      where: { materialCode: dto.materialCode.trim() },
    });
    if (existing) {
      throw new ConflictException('A material with this code already exists');
    }
    await this.assertCategoryAndUnitExist(dto.categoryId, dto.unitId);

    try {
      return await this.prisma.material.create({
        data: { ...dto, materialCode: dto.materialCode.trim() },
        include: { category: true, unit: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A material with this code already exists');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateMaterialDto) {
    await this.findOne(id);

    if (dto.materialCode) {
      const existing = await this.prisma.material.findUnique({
        where: { materialCode: dto.materialCode.trim() },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('A material with this code already exists');
      }
    }

    if (dto.categoryId || dto.unitId) {
      const current = await this.prisma.material.findUnique({ where: { id } });
      await this.assertCategoryAndUnitExist(
        dto.categoryId ?? current!.categoryId,
        dto.unitId ?? current!.unitId,
      );
    }

    try {
      return await this.prisma.material.update({
        where: { id },
        data: {
          ...dto,
          ...(dto.materialCode ? { materialCode: dto.materialCode.trim() } : {}),
        },
        include: { category: true, unit: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A material with this code already exists');
      }
      throw error;
    }
  }

  async deactivate(id: string) {
    await this.findOne(id);
    return this.prisma.material.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async exportToExcel(): Promise<Buffer> {
    const materials = await this.prisma.material.findMany({
      where: { isActive: true },
      include: { category: true, unit: true },
      orderBy: { materialCode: 'asc' },
    });

    const rows = materials.map((material) => ({
      materialCode: material.materialCode,
      name: material.name,
      description: material.description ?? '',
      category: material.category.name,
      unit: material.unit.name,
      supplierId: material.supplierId ?? '',
      cost: material.cost ?? '',
      minimumStock: material.minimumStock,
      maximumStock: material.maximumStock ?? '',
      reorderLevel: material.reorderLevel,
      currentStock: material.currentStock,
      warehouseId: material.warehouseId ?? '',
      isActive: material.isActive,
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows, { header: [...EXCEL_COLUMNS] });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Materials');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  async importFromExcel(fileBuffer: Buffer) {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new BadRequestException('The uploaded file has no worksheets');
    }
    const sheet = workbook.Sheets[sheetName];
    const parsedRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
    });

    if (parsedRows.length === 0) {
      throw new BadRequestException('The uploaded file has no data rows');
    }

    // Resolve category/unit names to ids once, up front, so every row does
    // not need its own database round trip.
    const [categories, units] = await Promise.all([
      this.prisma.materialCategory.findMany(),
      this.prisma.materialUnit.findMany(),
    ]);
    const categoryByName = new Map(
      categories.map((category) => [category.name.trim().toLowerCase(), category]),
    );
    const unitByName = new Map(units.map((unit) => [unit.name.trim().toLowerCase(), unit]));

    const results: ImportRowResult[] = [];
    let created = 0;
    let updated = 0;
    let failed = 0;

    for (let i = 0; i < parsedRows.length; i++) {
      const raw = parsedRows[i];
      const rowNumber = i + 2; // account for the header row
      const materialCode = String(raw.materialCode ?? '').trim();

      try {
        if (!materialCode) {
          throw new Error('materialCode is required');
        }
        const name = String(raw.name ?? '').trim();
        if (!name) {
          throw new Error('name is required');
        }

        const categoryName = String(raw.category ?? '').trim().toLowerCase();
        const category = categoryByName.get(categoryName);
        if (!category) {
          throw new Error(`Category "${raw.category ?? ''}" not found`);
        }

        const unitName = String(raw.unit ?? '').trim().toLowerCase();
        const unit = unitByName.get(unitName);
        if (!unit) {
          throw new Error(`Unit "${raw.unit ?? ''}" not found`);
        }

        const currentStock = raw.currentStock === '' ? 0 : Number(raw.currentStock);
        if (Number.isNaN(currentStock) || currentStock < 0) {
          throw new Error('currentStock cannot be negative');
        }

        const data = {
          materialCode,
          name,
          description: raw.description ? String(raw.description) : undefined,
          categoryId: category.id,
          unitId: unit.id,
          supplierId: raw.supplierId ? String(raw.supplierId) : undefined,
          cost: raw.cost === '' || raw.cost === undefined ? undefined : Number(raw.cost),
          minimumStock: raw.minimumStock === '' ? 0 : Number(raw.minimumStock),
          maximumStock:
            raw.maximumStock === '' || raw.maximumStock === undefined
              ? undefined
              : Number(raw.maximumStock),
          reorderLevel: raw.reorderLevel === '' ? 0 : Number(raw.reorderLevel),
          currentStock,
          warehouseId: raw.warehouseId ? String(raw.warehouseId) : undefined,
          isActive:
            raw.isActive === '' || raw.isActive === undefined
              ? true
              : String(raw.isActive).toLowerCase() !== 'false',
        };

        const existing = await this.prisma.material.findUnique({ where: { materialCode } });
        if (existing) {
          await this.prisma.material.update({ where: { materialCode }, data });
          updated++;
          results.push({ row: rowNumber, materialCode, status: 'updated' });
        } else {
          await this.prisma.material.create({ data });
          created++;
          results.push({ row: rowNumber, materialCode, status: 'created' });
        }
      } catch (error) {
        failed++;
        results.push({
          row: rowNumber,
          materialCode: materialCode || '(missing)',
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      totalRows: parsedRows.length,
      created,
      updated,
      failed,
      results,
    };
  }
}
