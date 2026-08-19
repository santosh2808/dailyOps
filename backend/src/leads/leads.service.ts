import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LeadSource, LeadStatus, Prisma } from '@prisma/client';
import { isEmail } from 'class-validator';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';
import { QueryLeadDto } from './dto/query-lead.dto';
import { LeadProductInputDto } from './dto/lead-product-input.dto';
import { ImportLeadsDto } from './dto/import-leads.dto';

const LEAD_NUMBER_PREFIX = 'LD-';
const LEAD_NUMBER_PAD = 6;
const MAX_LEAD_NUMBER_ATTEMPTS = 5;

// Lead Import: maps the human-readable template headers (case-insensitive)
// to the row shape used internally. Any column in the uploaded file that
// isn't one of these (and isn't one of the phone headers below) is
// silently ignored, so extra columns don't break anything.
//
// Phone is deliberately NOT in this map — a file can have more than one
// phone-ish column (Work Direct Phone, Home Phone, Mobile Phone, etc. all
// at once), so it needs its own priority-based resolution instead of a
// flat 1:1 mapping. See LEAD_IMPORT_PHONE_HEADER_PRIORITY below.
const LEAD_IMPORT_COLUMN_MAP: Record<string, string> = {
  'company name': 'companyName',
  'contact person': 'contactPerson',
  'contact name': 'contactPerson',
  email: 'email',
  'email address': 'email',
  city: 'city',
  state: 'state',
  industry: 'industry',
  'lead source': 'source',
  status: 'status',
  remarks: 'remarks',
};

// Every header that can supply a phone number, in priority order. When a
// row has more than one of these columns filled in, the FIRST one in this
// list with a non-empty value wins: a plain Phone/Phone Number/Contact
// Number column (if present) is treated as unambiguous and takes top
// priority; failing that, Mobile Phone > Work Direct Phone > Home Phone,
// per how this business actually prioritizes reaching a lead.
const LEAD_IMPORT_PHONE_HEADER_PRIORITY: string[] = [
  'phone',
  'phone number',
  'contact number',
  'mobile phone',
  'mobile',
  'mobile number',
  'work direct phone',
  'home phone',
];

// Exact column order or the downloadable template, and the order the
// export-style import expects (though headers are matched by name, not
// position, so re-ordered columns still work).
const LEAD_IMPORT_TEMPLATE_HEADERS = [
  'Company Name',
  'Contact Person',
  'Email',
  'Phone',
  'City',
  'State',
  'Industry',
  'Lead Source',
  'Status',
  'Remarks',
];

const LEAD_SOURCE_VALUES: string[] = Object.values(LeadSource);
const LEAD_STATUS_VALUES: string[] = Object.values(LeadStatus);

function normalizeEnumInput(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

interface LeadImportRowInput {
  companyName?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  industry?: string;
  source?: string;
  status?: string;
  remarks?: string;
}

// Exported: this shape is threaded through the public return types of
// previewLeadImport()/importLeads(), so it must be nameable in the
// generated .d.ts output (the same reason Material Import's row-result type
// had to be exported).
export interface LeadImportRowResult {
  row: number;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  city?: string;
  state?: string;
  industry?: string;
  source: LeadSource;
  status: LeadStatus;
  remarks?: string;
  result: 'valid' | 'invalid' | 'duplicate' | 'created';
  errors?: string[];
  duplicateReason?: string;
  leadNumber?: string;
}

// Whitelisted so `sortBy` from the query string can never be used to sort by
// an arbitrary/unindexed or sensitive column.
const SORTABLE_FIELDS = [
  'createdAt',
  'updatedAt',
  'companyName',
  'estimatedValue',
  'nextFollowUp',
  'expectedCloseDate',
  'leadNumber',
  'priority',
  'status',
] as const;

const LEAD_DETAIL_INCLUDE = {
  products: { include: { product: true } },
} satisfies Prisma.LeadInclude;

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(query: QueryLeadDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();

    const where: Prisma.LeadWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.assignedTo ? { assignedTo: { equals: query.assignedTo } } : {}),
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
              { leadNumber: { contains: search, mode: 'insensitive' } },
              { companyName: { contains: search, mode: 'insensitive' } },
              { contactPerson: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
              { title: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const sortBy = SORTABLE_FIELDS.includes(query.sortBy as (typeof SORTABLE_FIELDS)[number])
      ? (query.sortBy as (typeof SORTABLE_FIELDS)[number])
      : 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

    const [data, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { products: true } } },
      }),
      this.prisma.lead.count({ where }),
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
    // Matches the Customer/Product convention: a direct lookup by id still
    // returns the record even if it has been soft-deleted; only the list
    // endpoint hides it by default.
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: LEAD_DETAIL_INCLUDE,
    });
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }
    return lead;
  }

  async create(dto: CreateLeadDto) {
    const { products, expectedCloseDate, nextFollowUp, ...leadData } = dto;

    for (let attempt = 1; attempt <= MAX_LEAD_NUMBER_ATTEMPTS; attempt++) {
      const leadNumber = await this.generateLeadNumber();
      try {
        return await this.prisma.lead.create({
          data: {
            ...leadData,
            leadNumber,
            expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : undefined,
            nextFollowUp: nextFollowUp ? new Date(nextFollowUp) : undefined,
            products: this.buildProductsCreateInput(products),
          },
          include: LEAD_DETAIL_INCLUDE,
        });
      } catch (error) {
        if (this.isLeadNumberConflict(error) && attempt < MAX_LEAD_NUMBER_ATTEMPTS) {
          continue; // Another request took this number first — retry with a fresh one.
        }
        throw error;
      }
    }

    // Unreachable, but keeps TypeScript satisfied about the return type.
    throw new Error('Failed to generate a unique lead number');
  }

  async update(id: string, dto: UpdateLeadDto) {
    await this.findOne(id);
    const { products, expectedCloseDate, nextFollowUp, ...leadData } = dto;

    return this.prisma.$transaction(async (tx) => {
      if (products) {
        await tx.leadProduct.deleteMany({ where: { leadId: id } });
      }

      return tx.lead.update({
        where: { id },
        data: {
          ...leadData,
          ...(expectedCloseDate !== undefined
            ? { expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : null }
            : {}),
          ...(nextFollowUp !== undefined
            ? { nextFollowUp: nextFollowUp ? new Date(nextFollowUp) : null }
            : {}),
          products: this.buildProductsCreateInput(products),
        },
        include: LEAD_DETAIL_INCLUDE,
      });
    });
  }

  async updateStatus(id: string, dto: UpdateLeadStatusDto) {
    await this.findOne(id);
    // This endpoint only ever updates the status field. Setting status to
    // WON does not create a Customer — that only happens when the user
    // explicitly calls convertToCustomer() via POST /:id/convert below.
    return this.prisma.lead.update({
      where: { id },
      data: { status: dto.status },
      include: LEAD_DETAIL_INCLUDE,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.lead.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async convertToCustomer(id: string) {
    const lead = await this.findOne(id);

    if (lead.status !== 'WON') {
      throw new BadRequestException('Only leads with status WON can be converted to a customer');
    }
    if (lead.isConverted) {
      throw new ConflictException('This lead has already been converted to a customer');
    }

    // Direct prisma.customer.create() (not CustomersService) — CustomersModule
    // doesn't export its service, and this avoids modifying that module.
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          companyName: lead.companyName,
          contactPerson: lead.contactPerson,
          phone: lead.phone,
          email: lead.email ?? undefined,
        },
      });

      const updatedLead = await tx.lead.update({
        where: { id },
        data: {
          isConverted: true,
          convertedAt: new Date(),
          customerId: customer.id,
        },
        include: LEAD_DETAIL_INCLUDE,
      });

      return { lead: updatedLead, customer };
    });
  }

  getLeadImportTemplate(): Buffer {
    const worksheet = XLSX.utils.aoa_to_sheet([LEAD_IMPORT_TEMPLATE_HEADERS]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  async previewLeadImport(fileBuffer: Buffer) {
    const rawRows = this.parseImportFile(fileBuffer);
    const rows: LeadImportRowResult[] = [];
    for (let i = 0; i < rawRows.length; i++) {
      rows.push(await this.classifyImportRow(rawRows[i], i + 2, { insert: false }));
    }
    return this.summarizeImportRows(rows);
  }

  async importLeads(dto: ImportLeadsDto) {
    const rows: LeadImportRowResult[] = [];
    for (let i = 0; i < dto.rows.length; i++) {
      const input = dto.rows[i];
      rows.push(
        await this.classifyImportRow(
          {
            companyName: input.companyName,
            contactPerson: input.contactPerson,
            email: input.email,
            phone: input.phone,
            city: input.city,
            state: input.state,
            industry: input.industry,
            source: input.source,
            status: input.status,
            remarks: input.remarks,
          },
          input.row ?? i + 2,
          { insert: true },
        ),
      );
    }
    return this.summarizeImportRows(rows);
  }

  private parseImportFile(buffer: Buffer): LeadImportRowInput[] {
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
      const mapped: LeadImportRowInput = {};
      const phoneCandidates: Record<string, string> = {};

      for (const [key, value] of Object.entries(raw)) {
        const normalizedKey = key.trim().toLowerCase();
        const stringValue = String(value ?? '').trim();

        if (LEAD_IMPORT_PHONE_HEADER_PRIORITY.includes(normalizedKey)) {
          phoneCandidates[normalizedKey] = stringValue;
          continue;
        }

        const mappedKey = LEAD_IMPORT_COLUMN_MAP[normalizedKey];
        if (mappedKey) {
          (mapped as Record<string, string>)[mappedKey] = stringValue;
        }
      }

      // First non-empty value, scanned in priority order — see the comment
      // on LEAD_IMPORT_PHONE_HEADER_PRIORITY above.
      for (const header of LEAD_IMPORT_PHONE_HEADER_PRIORITY) {
        if (phoneCandidates[header]) {
          mapped.phone = phoneCandidates[header];
          break;
        }
      }

      return mapped;
    });
  }

  // Shared by both the Preview step (insert: false, read-only) and the
  // commit step (insert: true) so validation and duplicate-detection are
  // never allowed to drift between the two — the commit endpoint always
  // re-runs this from scratch on whatever rows it's given rather than
  // trusting the client's earlier Preview classification.
  private async classifyImportRow(
    raw: LeadImportRowInput,
    rowNumber: number,
    options: { insert: boolean },
  ): Promise<LeadImportRowResult> {
    const companyName = raw.companyName?.trim() ?? '';
    const contactPerson = raw.contactPerson?.trim() ?? '';
    const email = raw.email?.trim() ?? '';
    const phoneRaw = raw.phone?.trim() ?? '';
    // Some CSV/XLSX exports prefix numeric-looking cells with a leading
    // apostrophe (a text-format marker) so leading zeros/plus signs aren't
    // reinterpreted as a number — strip that before normalizing, otherwise
    // it gets swept up with the rest of the punctuation below and the
    // country-code "+" that follows it is lost along with it.
    let phoneForNormalization = phoneRaw;
    if (phoneForNormalization.startsWith("'")) {
      phoneForNormalization = phoneForNormalization.slice(1).trim();
    }
    const phoneHasCountryCode = phoneForNormalization.startsWith('+');
    const phoneDigitsOnly = phoneForNormalization.replace(/\D/g, '');
    const phoneNormalized = phoneHasCountryCode ? `+${phoneDigitsOnly}` : phoneDigitsOnly;
    if (phoneRaw) {
      this.logger.debug(
        `Import row ${rowNumber} phone normalization: original="${phoneRaw}" normalized="${phoneNormalized}"`,
      );
    }
    const city = raw.city?.trim() || undefined;
    const state = raw.state?.trim() || undefined;
    const industry = raw.industry?.trim() || undefined;
    const remarks = raw.remarks?.trim() || undefined;

    // No field is mandatory — Company Name, Contact Person, Email, and
    // Phone can all be blank; a blank cell is accepted and that field is
    // simply left blank on the created lead (not an error), and every row
    // is imported regardless of which columns it has values in. Format is
    // still checked when a value IS provided, so garbage data doesn't
    // silently get imported just because presence is no longer required.
    const errors: string[] = [];
    if (email && !isEmail(email)) {
      errors.push('Email must be a valid email address');
    }
    if (phoneRaw && !/^\+?\d{10,15}$/.test(phoneNormalized)) {
      errors.push('Phone must be 10-15 digits');
      this.logger.debug(
        `Import row ${rowNumber} phone rejected: original="${phoneRaw}" normalized="${phoneNormalized}" reason="Phone must be 10-15 digits"`,
      );
    }

    // Blank cell -> sensible default (OTHER/NEW, matching the manual Create
    // Lead form's defaults); a non-blank but unrecognized value is flagged
    // as invalid rather than silently defaulted, so bad data gets fixed
    // instead of quietly mis-imported.
    let source: LeadSource = LeadSource.OTHER;
    const sourceRaw = raw.source?.trim() ?? '';
    if (sourceRaw) {
      const normalized = normalizeEnumInput(sourceRaw);
      if (LEAD_SOURCE_VALUES.includes(normalized)) {
        source = normalized as LeadSource;
      } else {
        errors.push(`Unrecognized Lead Source: "${sourceRaw}"`);
      }
    }

    let status: LeadStatus = LeadStatus.NEW;
    const statusRaw = raw.status?.trim() ?? '';
    if (statusRaw) {
      const normalized = normalizeEnumInput(statusRaw);
      if (LEAD_STATUS_VALUES.includes(normalized)) {
        status = normalized as LeadStatus;
      } else {
        errors.push(`Unrecognized Status: "${statusRaw}"`);
      }
    }

    const base = {
      row: rowNumber,
      companyName,
      contactPerson,
      email,
      phone: phoneNormalized || phoneRaw,
      city,
      state,
      industry,
      source,
      status,
      remarks,
    };

    if (errors.length > 0) {
      return { ...base, result: 'invalid', errors };
    }

    // Duplicate detection is unchanged (Company Name + Email), so it only
    // applies when a row actually has an email — with Email now optional,
    // a blank-email row simply has nothing to match against and can never
    // be flagged as a duplicate by this rule.
    //
    // Runs sequentially (this method is always awaited in a plain for-loop
    // by its two callers, never Promise.all'd), so on the commit path a
    // lead inserted earlier in this same batch is already visible to this
    // findFirst — within-file duplicates and duplicates-against-existing-
    // data are both caught by one code path.
    if (email) {
      const existing = await this.prisma.lead.findFirst({
        where: {
          deletedAt: null,
          companyName: { equals: companyName, mode: 'insensitive' },
          email: { equals: email, mode: 'insensitive' },
        },
      });
      if (existing) {
        return {
          ...base,
          result: 'duplicate',
          duplicateReason: `Matches existing lead ${existing.leadNumber}`,
        };
      }
    }

    if (!options.insert) {
      return { ...base, result: 'valid' };
    }

    const created = await this.createImportedLead(base);
    return { ...base, result: 'created', leadNumber: created.leadNumber };
  }

  private async createImportedLead(row: {
    companyName: string;
    contactPerson: string;
    email: string;
    phone: string;
    city?: string;
    state?: string;
    industry?: string;
    source: LeadSource;
    status: LeadStatus;
    remarks?: string;
  }) {
    if (row.phone) {
      this.logger.debug(`Saving lead phone to database: final="${row.phone}"`);
    }
    for (let attempt = 1; attempt <= MAX_LEAD_NUMBER_ATTEMPTS; attempt++) {
      const leadNumber = await this.generateLeadNumber();
      try {
        return await this.prisma.lead.create({
          data: {
            leadNumber,
            companyName: row.companyName,
            contactPerson: row.contactPerson,
            email: row.email,
            phone: row.phone,
            city: row.city,
            state: row.state,
            industry: row.industry,
            remarks: row.remarks,
            source: row.source,
            status: row.status,
            // Imported leads have no natural "opportunity title" — the
            // import template has no Title column, unlike the manual Create
            // Lead form where it's required and user-authored. Defaulted
            // from Company Name so the required `title` column is always
            // populated with something meaningful, and is editable
            // afterwards from the Lead Details/Edit page like any other
            // lead.
            title: `Imported Lead - ${row.companyName}`,
          },
        });
      } catch (error) {
        if (this.isLeadNumberConflict(error) && attempt < MAX_LEAD_NUMBER_ATTEMPTS) {
          continue; // Another request took this number first — retry with a fresh one.
        }
        throw error;
      }
    }
    throw new Error('Failed to generate a unique lead number');
  }

  private summarizeImportRows(rows: LeadImportRowResult[]) {
    return {
      totalRows: rows.length,
      validCount: rows.filter((r) => r.result === 'valid').length,
      createdCount: rows.filter((r) => r.result === 'created').length,
      invalidCount: rows.filter((r) => r.result === 'invalid').length,
      duplicateCount: rows.filter((r) => r.result === 'duplicate').length,
      rows,
    };
  }

  private buildProductsCreateInput(products?: LeadProductInputDto[]) {
    if (!products || products.length === 0) {
      return undefined;
    }
    return {
      create: products.map((p) => ({
        productId: p.productId,
        quantity: p.quantity,
        unitPrice: p.unitPrice,
        remarks: p.remarks,
      })),
    };
  }

  private async generateLeadNumber(): Promise<string> {
    const last = await this.prisma.lead.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { leadNumber: true },
    });
    const lastSeq = last ? parseInt(last.leadNumber.replace(LEAD_NUMBER_PREFIX, ''), 10) || 0 : 0;
    return `${LEAD_NUMBER_PREFIX}${String(lastSeq + 1).padStart(LEAD_NUMBER_PAD, '0')}`;
  }

  private isLeadNumberConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      Array.isArray(error.meta?.target) &&
      (error.meta?.target as string[]).includes('leadNumber')
    );
  }
}
