import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { Prisma, SupplierStatus } from '@prisma/client';
import { isEmail } from 'class-validator';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { QuerySupplierDto } from './dto/query-supplier.dto';
import { ImportSuppliersDto } from './dto/import-suppliers.dto';

const SUPPLIER_CODE_PREFIX = 'SUP-';
const SUPPLIER_CODE_PAD = 6;
const MAX_SUPPLIER_CODE_ATTEMPTS = 5;

// Maps the human-readable template headers (case-insensitive) to the row
// shape used internally. Any column in the uploaded file that isn't one of
// these is silently ignored, so extra columns don't break anything — same
// convention as Lead Import's LEAD_IMPORT_COLUMN_MAP.
const SUPPLIER_IMPORT_COLUMN_MAP: Record<string, string> = {
  'supplier name': 'supplierName',
  name: 'supplierName',
  'gst number': 'gstNumber',
  gst: 'gstNumber',
  gstin: 'gstNumber',
  'pan number': 'panNumber',
  pan: 'panNumber',
  'contact person': 'contactPerson',
  'contact name': 'contactPerson',
  phone: 'phone',
  'phone number': 'phone',
  'contact number': 'phone',
  email: 'email',
  'email address': 'email',
  website: 'website',
  address: 'address',
  city: 'city',
  state: 'state',
  country: 'country',
  'pin code': 'pinCode',
  pincode: 'pinCode',
  'zip code': 'pinCode',
  'payment terms': 'paymentTerms',
  'lead time': 'leadTime',
  currency: 'currency',
  remarks: 'remarks',
  status: 'status',
};

// Exact column order of the downloadable template, and the order the
// export-style import expects (though headers are matched by name, not
// position, so re-ordered columns still work).
const SUPPLIER_IMPORT_TEMPLATE_HEADERS = [
  'Supplier Name',
  'GST Number',
  'PAN Number',
  'Contact Person',
  'Phone',
  'Email',
  'Website',
  'Address',
  'City',
  'State',
  'Country',
  'PIN Code',
  'Payment Terms',
  'Lead Time',
  'Currency',
  'Remarks',
  'Status',
];

const SUPPLIER_STATUS_VALUES: string[] = Object.values(SupplierStatus);

function normalizeEnumInput(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

interface SupplierImportRowInput {
  supplierName?: string;
  gstNumber?: string;
  panNumber?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  pinCode?: string;
  paymentTerms?: string;
  leadTime?: string;
  currency?: string;
  remarks?: string;
  status?: string;
}

// Exported: this shape is threaded through the public return types of
// previewSupplierImport()/importSuppliers(), so it must be nameable in the
// generated .d.ts output (same reason as Lead Import's LeadImportRowResult).
export interface SupplierImportRowResult {
  row: number;
  supplierName: string;
  gstNumber?: string;
  panNumber?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  pinCode?: string;
  paymentTerms?: string;
  leadTime?: number;
  currency?: string;
  remarks?: string;
  status: SupplierStatus;
  result: 'valid' | 'invalid' | 'duplicate' | 'created';
  errors?: string[];
  duplicateReason?: string;
  supplierCode?: string;
}

// Whitelisted so `sortBy` from the query string can never be used to sort by
// an arbitrary/unindexed column.
const SORTABLE_FIELDS = [
  'createdAt',
  'updatedAt',
  'supplierCode',
  'supplierName',
  'leadTime',
  'status',
] as const;

@Injectable()
export class SuppliersService {
  private readonly logger = new Logger(SuppliersService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(query: QuerySupplierDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();

    const where: Prisma.SupplierWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.country ? { country: { equals: query.country, mode: 'insensitive' } } : {}),
      ...(search
        ? {
            OR: [
              { supplierCode: { contains: search, mode: 'insensitive' } },
              { supplierName: { contains: search, mode: 'insensitive' } },
              { contactPerson: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { gstNumber: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const sortBy = SORTABLE_FIELDS.includes(query.sortBy as (typeof SORTABLE_FIELDS)[number])
      ? (query.sortBy as (typeof SORTABLE_FIELDS)[number])
      : 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

    const [data, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.supplier.count({ where }),
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
    // Matches the Lead/Material convention: a direct lookup by id still
    // returns the record even if it has been soft-deleted; only the list
    // endpoint hides it by default.
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }
    return supplier;
  }

  async create(dto: CreateSupplierDto) {
    for (let attempt = 1; attempt <= MAX_SUPPLIER_CODE_ATTEMPTS; attempt++) {
      const supplierCode = await this.generateSupplierCode();
      try {
        return await this.prisma.supplier.create({
          data: { ...dto, supplierCode },
        });
      } catch (error) {
        if (this.isSupplierCodeConflict(error) && attempt < MAX_SUPPLIER_CODE_ATTEMPTS) {
          continue; // Another request took this code first — retry with a fresh one.
        }
        throw error;
      }
    }
    throw new Error('Failed to generate a unique supplier code');
  }

  async update(id: string, dto: UpdateSupplierDto) {
    await this.findOne(id);
    return this.prisma.supplier.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.supplier.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  getSupplierImportTemplate(): Buffer {
    const worksheet = XLSX.utils.aoa_to_sheet([SUPPLIER_IMPORT_TEMPLATE_HEADERS]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Suppliers');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  async exportToExcel(): Promise<Buffer> {
    const suppliers = await this.prisma.supplier.findMany({
      where: { deletedAt: null },
      orderBy: { supplierCode: 'asc' },
    });

    const rows = suppliers.map((supplier) => ({
      'Supplier Code': supplier.supplierCode,
      'Supplier Name': supplier.supplierName,
      'GST Number': supplier.gstNumber ?? '',
      'PAN Number': supplier.panNumber ?? '',
      'Contact Person': supplier.contactPerson ?? '',
      Phone: supplier.phone ?? '',
      Email: supplier.email ?? '',
      Website: supplier.website ?? '',
      Address: supplier.address ?? '',
      City: supplier.city ?? '',
      State: supplier.state ?? '',
      Country: supplier.country ?? '',
      'PIN Code': supplier.pinCode ?? '',
      'Payment Terms': supplier.paymentTerms ?? '',
      'Lead Time': supplier.leadTime ?? '',
      Currency: supplier.currency ?? '',
      Remarks: supplier.remarks ?? '',
      Status: supplier.status,
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows, {
      header: ['Supplier Code', ...SUPPLIER_IMPORT_TEMPLATE_HEADERS],
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Suppliers');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  async previewSupplierImport(fileBuffer: Buffer) {
    const rawRows = this.parseImportFile(fileBuffer);
    const rows: SupplierImportRowResult[] = [];
    for (let i = 0; i < rawRows.length; i++) {
      rows.push(await this.classifyImportRow(rawRows[i], i + 2, { insert: false }));
    }
    return this.summarizeImportRows(rows);
  }

  async importSuppliers(dto: ImportSuppliersDto) {
    const rows: SupplierImportRowResult[] = [];
    for (let i = 0; i < dto.rows.length; i++) {
      const input = dto.rows[i];
      rows.push(
        await this.classifyImportRow(
          {
            supplierName: input.supplierName,
            gstNumber: input.gstNumber,
            panNumber: input.panNumber,
            contactPerson: input.contactPerson,
            phone: input.phone,
            email: input.email,
            website: input.website,
            address: input.address,
            city: input.city,
            state: input.state,
            country: input.country,
            pinCode: input.pinCode,
            paymentTerms: input.paymentTerms,
            leadTime: input.leadTime,
            currency: input.currency,
            remarks: input.remarks,
            status: input.status,
          },
          input.row ?? i + 2,
          { insert: true },
        ),
      );
    }
    return this.summarizeImportRows(rows);
  }

  private parseImportFile(buffer: Buffer): SupplierImportRowInput[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new BadRequestException('The uploaded file has no worksheets');
    }
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    if (rawRows.length === 0) {
      throw new BadRequestException('The uploaded file has no data rows');
    }

    return rawRows.map((raw) => {
      const mapped: SupplierImportRowInput = {};

      for (const [key, value] of Object.entries(raw)) {
        const normalizedKey = key.trim().toLowerCase();
        const stringValue = String(value ?? '').trim();

        const mappedKey = SUPPLIER_IMPORT_COLUMN_MAP[normalizedKey];
        if (mappedKey) {
          (mapped as Record<string, string>)[mappedKey] = stringValue;
        }
      }

      return mapped;
    });
  }

  // Shared by both the Preview step (insert: false, read-only) and the
  // commit step (insert: true) so validation and duplicate-detection are
  // never allowed to drift between the two — same convention as Lead
  // Import's classifyImportRow().
  private async classifyImportRow(
    raw: SupplierImportRowInput,
    rowNumber: number,
    options: { insert: boolean },
  ): Promise<SupplierImportRowResult> {
    const supplierName = raw.supplierName?.trim() ?? '';
    const gstNumber = raw.gstNumber?.trim() || undefined;
    const panNumber = raw.panNumber?.trim() || undefined;
    const contactPerson = raw.contactPerson?.trim() || undefined;
    const email = raw.email?.trim() || undefined;
    const website = raw.website?.trim() || undefined;
    const address = raw.address?.trim() || undefined;
    const city = raw.city?.trim() || undefined;
    const state = raw.state?.trim() || undefined;
    const country = raw.country?.trim() || undefined;
    const pinCode = raw.pinCode?.trim() || undefined;
    const paymentTerms = raw.paymentTerms?.trim() || undefined;
    const currency = raw.currency?.trim() || undefined;
    const remarks = raw.remarks?.trim() || undefined;

    const phoneRaw = raw.phone?.trim() ?? '';
    // Same normalization as Lead Import: strip a leading apostrophe (a
    // text-format marker some CSV/XLSX exports add) and preserve a leading
    // "+" country code instead of stripping it along with the rest of the
    // punctuation.
    let phoneForNormalization = phoneRaw;
    if (phoneForNormalization.startsWith("'")) {
      phoneForNormalization = phoneForNormalization.slice(1).trim();
    }
    const phoneHasCountryCode = phoneForNormalization.startsWith('+');
    const phoneDigitsOnly = phoneForNormalization.replace(/\D/g, '');
    const phoneNormalized = phoneHasCountryCode ? `+${phoneDigitsOnly}` : phoneDigitsOnly;
    const phone = phoneNormalized || phoneRaw || undefined;

    // Only Supplier Name is required — every other field is optional, and
    // is format-checked only when a value IS provided, so garbage data
    // doesn't silently get imported just because presence is no longer
    // required (same convention as Lead Import).
    const errors: string[] = [];
    if (!supplierName) {
      errors.push('Supplier name is required');
    }
    if (email && !isEmail(email)) {
      errors.push('Email must be a valid email address');
    }
    if (phoneRaw && !/^\+?\d{10,15}$/.test(phoneNormalized)) {
      errors.push('Phone must be 10-15 digits');
    }

    let leadTime: number | undefined;
    const leadTimeRaw = raw.leadTime?.trim() ?? '';
    if (leadTimeRaw) {
      const parsed = Number(leadTimeRaw);
      if (Number.isNaN(parsed) || parsed < 0) {
        errors.push('Lead time must be a non-negative number');
      } else {
        leadTime = parsed;
      }
    }

    // Blank cell -> sensible default (ACTIVE, matching the manual Create
    // Supplier form's default); a non-blank but unrecognized value is
    // flagged as invalid rather than silently defaulted.
    let status: SupplierStatus = SupplierStatus.ACTIVE;
    const statusRaw = raw.status?.trim() ?? '';
    if (statusRaw) {
      const normalized = normalizeEnumInput(statusRaw);
      if (SUPPLIER_STATUS_VALUES.includes(normalized)) {
        status = normalized as SupplierStatus;
      } else {
        errors.push(`Unrecognized Status: "${statusRaw}"`);
      }
    }

    const base: SupplierImportRowResult = {
      row: rowNumber,
      supplierName,
      gstNumber,
      panNumber,
      contactPerson,
      phone,
      email,
      website,
      address,
      city,
      state,
      country,
      pinCode,
      paymentTerms,
      leadTime,
      currency,
      remarks,
      status,
      result: 'valid',
    };

    if (errors.length > 0) {
      return { ...base, result: 'invalid', errors };
    }

    // Duplicate detection: supplierName is the only required/identifying
    // field, so an exact case-insensitive name match against a non-deleted
    // supplier is treated as a duplicate — same "match on what's actually
    // required" convention as Lead Import (companyName + email there).
    const existing = await this.prisma.supplier.findFirst({
      where: {
        deletedAt: null,
        supplierName: { equals: supplierName, mode: 'insensitive' },
      },
    });
    if (existing) {
      return {
        ...base,
        result: 'duplicate',
        duplicateReason: `Matches existing supplier ${existing.supplierCode}`,
      };
    }

    if (!options.insert) {
      return { ...base, result: 'valid' };
    }

    const created = await this.createImportedSupplier(base);
    return { ...base, result: 'created', supplierCode: created.supplierCode };
  }

  private async createImportedSupplier(row: {
    supplierName: string;
    gstNumber?: string;
    panNumber?: string;
    contactPerson?: string;
    phone?: string;
    email?: string;
    website?: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    pinCode?: string;
    paymentTerms?: string;
    leadTime?: number;
    currency?: string;
    remarks?: string;
    status: SupplierStatus;
  }) {
    for (let attempt = 1; attempt <= MAX_SUPPLIER_CODE_ATTEMPTS; attempt++) {
      const supplierCode = await this.generateSupplierCode();
      try {
        return await this.prisma.supplier.create({
          data: {
            supplierCode,
            supplierName: row.supplierName,
            gstNumber: row.gstNumber,
            panNumber: row.panNumber,
            contactPerson: row.contactPerson,
            phone: row.phone,
            email: row.email,
            website: row.website,
            address: row.address,
            city: row.city,
            state: row.state,
            country: row.country,
            pinCode: row.pinCode,
            paymentTerms: row.paymentTerms,
            leadTime: row.leadTime,
            currency: row.currency,
            remarks: row.remarks,
            status: row.status,
          },
        });
      } catch (error) {
        if (this.isSupplierCodeConflict(error) && attempt < MAX_SUPPLIER_CODE_ATTEMPTS) {
          continue; // Another request took this code first — retry with a fresh one.
        }
        throw error;
      }
    }
    throw new Error('Failed to generate a unique supplier code');
  }

  private summarizeImportRows(rows: SupplierImportRowResult[]) {
    return {
      totalRows: rows.length,
      validCount: rows.filter((r) => r.result === 'valid').length,
      createdCount: rows.filter((r) => r.result === 'created').length,
      invalidCount: rows.filter((r) => r.result === 'invalid').length,
      duplicateCount: rows.filter((r) => r.result === 'duplicate').length,
      rows,
    };
  }

  private async generateSupplierCode(): Promise<string> {
    const last = await this.prisma.supplier.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { supplierCode: true },
    });
    const lastSeq = last ? parseInt(last.supplierCode.replace(SUPPLIER_CODE_PREFIX, ''), 10) || 0 : 0;
    return `${SUPPLIER_CODE_PREFIX}${String(lastSeq + 1).padStart(SUPPLIER_CODE_PAD, '0')}`;
  }

  private isSupplierCodeConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      Array.isArray(error.meta?.target) &&
      (error.meta?.target as string[]).includes('supplierCode')
    );
  }
}
