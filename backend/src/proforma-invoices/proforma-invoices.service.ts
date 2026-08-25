import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { PdfService } from '../pdf/pdf.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateProformaInvoiceDto } from './dto/create-proforma-invoice.dto';
import { UpdateProformaInvoiceStatusDto } from './dto/update-proforma-invoice-status.dto';
import { QueryProformaInvoiceDto } from './dto/query-proforma-invoice.dto';

const INVOICE_NUMBER_PREFIX = 'PI-';
const INVOICE_NUMBER_PAD = 6;
const MAX_INVOICE_NUMBER_ATTEMPTS = 5;

// Whitelisted so `sortBy` from the query string can never be used to sort by
// an arbitrary/unindexed or sensitive column.
const SORTABLE_FIELDS = [
  'createdAt',
  'updatedAt',
  'invoiceNumber',
  'grandTotal',
  'invoiceDate',
  'validUntil',
  'status',
] as const;

// No ProformaInvoiceItem table exists (see schema.prisma comment) — line
// items are read live through the linked Sales Order for display.
const PROFORMA_INVOICE_DETAIL_INCLUDE = {
  customer: true,
  salesOrder: {
    include: { items: { include: { product: true } } },
  },
} satisfies Prisma.ProformaInvoiceInclude;

const PROFORMA_INVOICE_LIST_INCLUDE = {
  customer: true,
  salesOrder: { select: { id: true, salesOrderNumber: true } },
} satisfies Prisma.ProformaInvoiceInclude;

@Injectable()
export class ProformaInvoicesService {
  private readonly logger = new Logger(ProformaInvoicesService.name);

  constructor(
    private prisma: PrismaService,
    private mailerService: MailerService,
    private pdfService: PdfService,
    private auditLogService: AuditLogService,
  ) {}

  async findAll(query: QueryProformaInvoiceDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();

    const where: Prisma.ProformaInvoiceWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.salesOrderId ? { salesOrderId: query.salesOrderId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            invoiceDate: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { invoiceNumber: { contains: search, mode: 'insensitive' } },
              { salesOrder: { salesOrderNumber: { contains: search, mode: 'insensitive' } } },
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
      this.prisma.proformaInvoice.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
        include: PROFORMA_INVOICE_LIST_INCLUDE,
      }),
      this.prisma.proformaInvoice.count({ where }),
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
    const invoice = await this.prisma.proformaInvoice.findUnique({
      where: { id },
      include: PROFORMA_INVOICE_DETAIL_INCLUDE,
    });
    if (!invoice) {
      throw new NotFoundException('Proforma invoice not found');
    }
    return invoice;
  }

  async create(dto: CreateProformaInvoiceDto, actorName?: string) {
    const salesOrder = await this.prisma.salesOrder.findUnique({ where: { id: dto.salesOrderId } });
    if (!salesOrder) {
      throw new NotFoundException('Sales order not found');
    }

    // Prevent duplicate Proforma Invoices for the same Sales Order unless
    // the existing one has been cancelled.
    const existingActive = await this.prisma.proformaInvoice.findFirst({
      where: { salesOrderId: dto.salesOrderId, status: { not: 'CANCELLED' } },
    });
    if (existingActive) {
      throw new ConflictException(
        'A Proforma Invoice already exists for this Sales Order. Cancel it first to generate a new one.',
      );
    }

    // Customer and amounts are copied straight from the Sales Order — never
    // re-entered by hand. Only invoice-specific fields (bank details,
    // validity, notes, and an optional payment-terms override) come from
    // the request body.
    for (let attempt = 1; attempt <= MAX_INVOICE_NUMBER_ATTEMPTS; attempt++) {
      const invoiceNumber = await this.generateInvoiceNumber();
      try {
        const created = await this.prisma.proformaInvoice.create({
          data: {
            invoiceNumber,
            salesOrderId: salesOrder.id,
            customerId: salesOrder.customerId,
            subtotal: salesOrder.subtotal,
            discount: salesOrder.discount,
            tax: salesOrder.tax,
            grandTotal: salesOrder.grandTotal,
            invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : undefined,
            validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
            paymentTerms: dto.paymentTerms ?? salesOrder.paymentTerms,
            bankName: dto.bankName,
            accountNumber: dto.accountNumber,
            ifscCode: dto.ifscCode,
            branch: dto.branch,
            notes: dto.notes,
          },
          include: PROFORMA_INVOICE_DETAIL_INCLUDE,
        });

        await this.auditLogService
          .record({
            module: 'ProformaInvoice',
            recordId: created.id,
            action: 'Created',
            actorName,
            newValue: { invoiceNumber: created.invoiceNumber, grandTotal: created.grandTotal },
          })
          .catch((error) => this.logger.error('AuditLog record failed', error));

        // Requirement #12: generate PDF, email customer, CC Finance,
        // record Email History — every time a Proforma Invoice is
        // generated, manual or automatic (both run through this one
        // create() method).
        await this.sendInvoiceEmail(created, actorName);

        return created;
      } catch (error) {
        if (this.isInvoiceNumberConflict(error) && attempt < MAX_INVOICE_NUMBER_ATTEMPTS) {
          continue; // Another request took this number first — retry with a fresh one.
        }
        throw error;
      }
    }

    // Unreachable, but keeps TypeScript satisfied about the return type.
    throw new Error('Failed to generate a unique invoice number');
  }

  // Automatic-cascade entry point (requirement — Sales Order ->
  // automatically generate Proforma Invoice), invoked from
  // QuotationsService.performAccept(). Idempotent: if an active
  // (non-CANCELLED) Proforma Invoice already exists for this Sales Order,
  // it's returned as-is rather than throwing create()'s ConflictException
  // — this path must never surface a scary error to the person who just
  // approved a quotation.
  async createFromSalesOrder(salesOrderId: string, actorName?: string) {
    const existing = await this.prisma.proformaInvoice.findFirst({
      where: { salesOrderId, status: { not: 'CANCELLED' } },
    });
    if (existing) {
      return this.findOne(existing.id);
    }
    return this.create({ salesOrderId }, actorName);
  }

  async updateStatus(id: string, dto: UpdateProformaInvoiceStatusDto, actorName?: string) {
    const existing = await this.findOne(id);
    const updated = await this.prisma.proformaInvoice.update({
      where: { id },
      data: { status: dto.status },
      include: PROFORMA_INVOICE_DETAIL_INCLUDE,
    });
    await this.auditLogService
      .record({
        module: 'ProformaInvoice',
        recordId: id,
        action: 'Status Changed',
        actorName,
        oldValue: { status: existing.status },
        newValue: { status: dto.status },
      })
      .catch((error) => this.logger.error('AuditLog record failed', error));
    return updated;
  }

  getEmailHistory(id: string) {
    return this.prisma.emailHistory.findMany({
      where: { proformaInvoiceId: id },
      orderBy: { sentAt: 'desc' },
    });
  }

  private async sendInvoiceEmail(
    invoice: Prisma.ProformaInvoiceGetPayload<{ include: typeof PROFORMA_INVOICE_DETAIL_INCLUDE }>,
    actorName?: string,
  ) {
    try {
      const pdf = await this.pdfService.render({
        documentTitle: 'PROFORMA INVOICE',
        documentNumber: invoice.invoiceNumber,
        documentDate: invoice.invoiceDate,
        customerName: invoice.customer.companyName,
        customerContact: `${invoice.customer.contactPerson} · ${invoice.customer.phone}`,
        items: invoice.salesOrder.items.map((item) => ({
          name: item.product.name,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
        })),
        subtotal: invoice.subtotal,
        discount: invoice.discount,
        tax: invoice.tax,
        grandTotal: invoice.grandTotal,
        notes: invoice.notes,
      });

      await this.mailerService.send({
        templateKey: 'PROFORMA_INVOICE',
        fallbackSubject: `Proforma Invoice ${invoice.invoiceNumber}`,
        fallbackBodyHtml: `<p>Dear {{customerName}},</p><p>Please find attached Proforma Invoice {{invoiceNumber}} for Sales Order {{salesOrderNumber}}. Grand total: {{grandTotal}}.</p>`,
        vars: {
          customerName: invoice.customer.contactPerson,
          invoiceNumber: invoice.invoiceNumber,
          salesOrderNumber: invoice.salesOrder.salesOrderNumber,
          grandTotal: invoice.grandTotal.toFixed(2),
        },
        to: invoice.customer.email,
        // "CC Finance" (requirement #12) — env-configurable so this isn't a
        // hardcoded address; unset simply means no CC is added.
        cc: process.env.FINANCE_TEAM_EMAIL || undefined,
        attachments: [{ filename: `${invoice.invoiceNumber}.pdf`, content: pdf }],
        actorName,
        link: { module: 'ProformaInvoice', proformaInvoiceId: invoice.id },
      });
    } catch (error) {
      this.logger.error(`Proforma Invoice email failed for ${invoice.id}`, error);
    }
  }

  private async generateInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const yearPrefix = `${INVOICE_NUMBER_PREFIX}${year}-`;
    const last = await this.prisma.proformaInvoice.findFirst({
      where: { invoiceNumber: { startsWith: yearPrefix } },
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    });
    const lastSeq = last ? parseInt(last.invoiceNumber.replace(yearPrefix, ''), 10) || 0 : 0;
    return `${yearPrefix}${String(lastSeq + 1).padStart(INVOICE_NUMBER_PAD, '0')}`;
  }

  private isInvoiceNumberConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      Array.isArray(error.meta?.target) &&
      (error.meta?.target as string[]).includes('invoiceNumber')
    );
  }
}
