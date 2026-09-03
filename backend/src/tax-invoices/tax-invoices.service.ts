import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { mergeCc } from '../mailer/default-cc-emails';
import { TaxInvoicePdfService } from '../pdf/tax-invoice-pdf.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateTaxInvoiceDto } from './dto/create-tax-invoice.dto';
import { UpdateTaxInvoiceDto } from './dto/update-tax-invoice.dto';
import { UpdateTaxInvoiceStatusDto } from './dto/update-tax-invoice-status.dto';
import { QueryTaxInvoiceDto } from './dto/query-tax-invoice.dto';
import { SendTaxInvoiceDto } from './dto/send-tax-invoice.dto';
import { UpdateTaxInvoiceEInvoiceDto } from './dto/update-tax-invoice-einvoice.dto';

// First fiscal-year sequence floor: FY2026-27 already had Tax Invoice
// SRM/2026-27/134 issued by hand in Tally before this automated numbering
// existed (see the uploaded reference invoice) — the next automated one for
// that fiscal year must start at 135, not 1. Every other fiscal year (and
// this one again once it rolls past 134) has no override and starts at 1.
const FISCAL_YEAR_SEQUENCE_FLOOR: Record<string, number> = {
  '2026-27': 134,
};
const MAX_INVOICE_NUMBER_ATTEMPTS = 5;

// Whitelisted so `sortBy` from the query string can never be used to sort by
// an arbitrary/unindexed or sensitive column.
const SORTABLE_FIELDS = ['createdAt', 'updatedAt', 'invoiceNumber', 'grandTotal', 'invoiceDate', 'status'] as const;

// No TaxInvoiceItem table exists (same convention as ProformaInvoice) — line
// items are read live through the linked Sales Order for display.
const TAX_INVOICE_DETAIL_INCLUDE = {
  customer: true,
  salesOrder: {
    include: { items: { include: { product: true } } },
  },
} satisfies Prisma.TaxInvoiceInclude;

const TAX_INVOICE_LIST_INCLUDE = {
  customer: true,
  salesOrder: { select: { id: true, salesOrderNumber: true } },
} satisfies Prisma.TaxInvoiceInclude;

@Injectable()
export class TaxInvoicesService {
  private readonly logger = new Logger(TaxInvoicesService.name);

  constructor(
    private prisma: PrismaService,
    private mailerService: MailerService,
    private taxInvoicePdfService: TaxInvoicePdfService,
    private auditLogService: AuditLogService,
  ) {}

  async findAll(query: QueryTaxInvoiceDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();

    const where: Prisma.TaxInvoiceWhereInput = {
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
      this.prisma.taxInvoice.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
        include: TAX_INVOICE_LIST_INCLUDE,
      }),
      this.prisma.taxInvoice.count({ where }),
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
    const invoice = await this.prisma.taxInvoice.findUnique({
      where: { id },
      include: TAX_INVOICE_DETAIL_INCLUDE,
    });
    if (!invoice) {
      throw new NotFoundException('Tax invoice not found');
    }
    return invoice;
  }

  // The automated replacement for "generate the Tax Invoice by hand in
  // Tally": requires the linked Sales Order to already have some advance
  // payment recorded (see ProformaInvoicesService.updateAdvance()) — the
  // same "any amount received" rule as the dispatch gate in
  // SalesOrdersService.updateStatus(), checked again here independently
  // since a Tax Invoice can in principle be generated before a dispatch
  // status change is attempted.
  async create(dto: CreateTaxInvoiceDto, actorName?: string) {
    const salesOrder = await this.prisma.salesOrder.findUnique({ where: { id: dto.salesOrderId } });
    if (!salesOrder) {
      throw new NotFoundException('Sales order not found');
    }

    const activeProformaInvoice = await this.prisma.proformaInvoice.findFirst({
      where: { salesOrderId: dto.salesOrderId, status: { not: 'CANCELLED' } },
      orderBy: { createdAt: 'desc' },
    });
    if (!activeProformaInvoice || activeProformaInvoice.advanceReceived <= 0) {
      throw new BadRequestException(
        'Advance payment has not been received for this order yet — a Tax Invoice can only be generated once an advance payment is recorded on the Proforma Invoice.',
      );
    }

    const existingActive = await this.prisma.taxInvoice.findFirst({
      where: { salesOrderId: dto.salesOrderId, status: { not: 'CANCELLED' } },
    });
    if (existingActive) {
      throw new ConflictException(
        'A Tax Invoice already exists for this Sales Order. Cancel it first to generate a new one.',
      );
    }

    for (let attempt = 1; attempt <= MAX_INVOICE_NUMBER_ATTEMPTS; attempt++) {
      const { invoiceNumber, fiscalYear, sequenceNumber } = await this.generateInvoiceNumber(
        dto.invoiceDate ? new Date(dto.invoiceDate) : new Date(),
      );
      try {
        const created = await this.prisma.taxInvoice.create({
          data: {
            invoiceNumber,
            fiscalYear,
            sequenceNumber,
            salesOrderId: salesOrder.id,
            customerId: salesOrder.customerId,
            invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : undefined,
            buyersOrderNo: dto.buyersOrderNo,
            dispatchedThrough: dto.dispatchedThrough,
            destination: dto.destination,
            termsOfDelivery: dto.termsOfDelivery,
            subtotal: salesOrder.subtotal,
            discount: salesOrder.discount,
            tax: salesOrder.tax,
            grandTotal: salesOrder.grandTotal,
            createdBy: actorName,
          },
          include: TAX_INVOICE_DETAIL_INCLUDE,
        });

        await this.auditLogService
          .record({
            module: 'TaxInvoice',
            recordId: created.id,
            action: 'Created',
            actorName,
            newValue: { invoiceNumber: created.invoiceNumber, grandTotal: created.grandTotal },
          })
          .catch((error) => this.logger.error('AuditLog record failed', error));

        // Generation only creates the DRAFT record — it no longer emails
        // automatically. The user reviews it (View PDF) and explicitly
        // triggers Send Tax Invoice when ready, same review-then-send
        // pattern as Quotation's sendQuotation().
        return created;
      } catch (error) {
        if (this.isInvoiceNumberConflict(error) && attempt < MAX_INVOICE_NUMBER_ATTEMPTS) {
          continue; // Another request took this number first — retry with a fresh one.
        }
        throw error;
      }
    }

    // Unreachable, but keeps TypeScript satisfied about the return type.
    throw new Error('Failed to generate a unique Tax Invoice number');
  }

  // Bug-fix requirement: edit a Tax Invoice's printed details even after
  // it's already been sent — sendInvoice() has never blocked resending, so
  // "edit, then Resend to Customer" is the intended fix-a-mistake flow. No
  // status guard here, same as QuotationsService.update().
  async update(id: string, dto: UpdateTaxInvoiceDto, actorName?: string) {
    const existing = await this.findOne(id);
    const updated = await this.prisma.taxInvoice.update({
      where: { id },
      data: {
        ...(dto.invoiceDate !== undefined ? { invoiceDate: new Date(dto.invoiceDate) } : {}),
        ...(dto.buyersOrderNo !== undefined ? { buyersOrderNo: dto.buyersOrderNo } : {}),
        ...(dto.dispatchedThrough !== undefined ? { dispatchedThrough: dto.dispatchedThrough } : {}),
        ...(dto.destination !== undefined ? { destination: dto.destination } : {}),
        ...(dto.termsOfDelivery !== undefined ? { termsOfDelivery: dto.termsOfDelivery } : {}),
      },
      include: TAX_INVOICE_DETAIL_INCLUDE,
    });
    await this.auditLogService
      .record({
        module: 'TaxInvoice',
        recordId: id,
        action: 'Edited',
        actorName,
        oldValue: {
          invoiceDate: existing.invoiceDate,
          buyersOrderNo: existing.buyersOrderNo,
          dispatchedThrough: existing.dispatchedThrough,
          destination: existing.destination,
          termsOfDelivery: existing.termsOfDelivery,
        },
        newValue: { ...dto },
      })
      .catch((error) => this.logger.error('AuditLog record failed', error));
    return updated;
  }

  async updateStatus(id: string, dto: UpdateTaxInvoiceStatusDto, actorName?: string) {
    const existing = await this.findOne(id);
    const updated = await this.prisma.taxInvoice.update({
      where: { id },
      data: { status: dto.status },
      include: TAX_INVOICE_DETAIL_INCLUDE,
    });
    await this.auditLogService
      .record({
        module: 'TaxInvoice',
        recordId: id,
        action: 'Status Changed',
        actorName,
        oldValue: { status: existing.status },
        newValue: { status: dto.status },
      })
      .catch((error) => this.logger.error('AuditLog record failed', error));
    return updated;
  }

  // GST e-invoicing (IRN + QR): entered manually after being obtained from
  // the government e-invoice portal/GSP (see schema.prisma comment on
  // TaxInvoice.irn — no confirmed live API integration exists yet).
  // Independently updatable so partial data (e.g. QR pasted before the IRN
  // is typed in) is never rejected.
  async updateEInvoiceDetails(id: string, dto: UpdateTaxInvoiceEInvoiceDto, actorName?: string) {
    const existing = await this.findOne(id);
    const updated = await this.prisma.taxInvoice.update({
      where: { id },
      data: {
        ...(dto.irn !== undefined ? { irn: dto.irn || null } : {}),
        ...(dto.ackNumber !== undefined ? { ackNumber: dto.ackNumber || null } : {}),
        ...(dto.ackDate !== undefined ? { ackDate: dto.ackDate ? new Date(dto.ackDate) : null } : {}),
        ...(dto.qrCodeImage !== undefined ? { qrCodeImage: dto.qrCodeImage || null } : {}),
        eInvoiceUpdatedBy: actorName,
        eInvoiceUpdatedAt: new Date(),
      },
      include: TAX_INVOICE_DETAIL_INCLUDE,
    });
    await this.auditLogService
      .record({
        module: 'TaxInvoice',
        recordId: id,
        action: 'e-Invoice Details Updated',
        actorName,
        oldValue: { irn: existing.irn, ackNumber: existing.ackNumber },
        newValue: { irn: updated.irn, ackNumber: updated.ackNumber, hasQrCode: !!updated.qrCodeImage },
      })
      .catch((error) => this.logger.error('AuditLog record failed', error));
    return updated;
  }

  getEmailHistory(id: string) {
    return this.prisma.emailHistory.findMany({
      where: { taxInvoiceId: id },
      orderBy: { sentAt: 'desc' },
    });
  }

  // Branded PDF (replicates the uploaded SRM/2026-27/134 reference) — used
  // both for the standalone GET :id/pdf download and internally by
  // sendInvoiceEmail()'s attachment, so the emailed copy and the on-demand
  // download are always byte-for-byte the same document.
  async getPdf(id: string): Promise<Buffer> {
    const invoice = await this.findOne(id);
    return this.taxInvoicePdfService.render(this.toPdfInput(invoice));
  }

  private toPdfInput(invoice: Prisma.TaxInvoiceGetPayload<{ include: typeof TAX_INVOICE_DETAIL_INCLUDE }>) {
    return {
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      customer: {
        companyName: invoice.customer.companyName,
        contactPerson: invoice.customer.contactPerson,
        state: invoice.customer.state,
        gstNumber: invoice.customer.gstNumber,
      },
      shippingAddress: invoice.salesOrder.shippingAddress,
      billingAddress: invoice.salesOrder.billingAddress,
      buyersOrderNo: invoice.buyersOrderNo,
      dispatchedThrough: invoice.dispatchedThrough,
      destination: invoice.destination,
      termsOfDelivery: invoice.termsOfDelivery,
      paymentTerms: invoice.salesOrder.paymentTerms,
      items: invoice.salesOrder.items.map((item) => ({
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount,
        tax: item.tax,
        lineTotal: item.lineTotal,
        description: item.description,
        product: { name: item.product.name },
      })),
      subtotal: invoice.subtotal,
      tax: invoice.tax,
      grandTotal: invoice.grandTotal,
      // GST e-invoicing: only meaningful for GST-registered customers
      // (customer.gstNumber above) — TaxInvoicePdfService decides whether
      // to render the QR block at all based on that.
      irn: invoice.irn,
      ackNumber: invoice.ackNumber,
      ackDate: invoice.ackDate,
      qrCodeImage: invoice.qrCodeImage,
    };
  }

  // Send Tax Invoice: the explicit step that actually emails the customer,
  // separated from create() so the generated invoice can be reviewed (View
  // PDF) first — same review-then-send pattern as
  // QuotationsService.sendQuotation(). Lets the sender override the
  // recipient/CC for this send only; defaults to the customer's email on
  // file. Blocked once cancelled — there's nothing left to send.
  async sendInvoice(id: string, dto: SendTaxInvoiceDto, actorName?: string) {
    const invoice = await this.findOne(id);
    if (invoice.status === 'CANCELLED') {
      throw new BadRequestException('A cancelled Tax Invoice cannot be sent');
    }

    const to = dto.recipientEmail?.trim() || invoice.customer.email || undefined;
    const pdf = await this.taxInvoicePdfService.render(this.toPdfInput(invoice));

    const result = await this.mailerService.send({
      templateKey: 'TAX_INVOICE',
      fallbackSubject: `Tax Invoice ${invoice.invoiceNumber}`,
      fallbackBodyHtml: `<p>Dear {{customerName}},</p><p>Please find attached the Tax Invoice {{invoiceNumber}} for Sales Order {{salesOrderNumber}}. Grand total: {{grandTotal}}.</p>`,
      vars: {
        customerName: invoice.customer.contactPerson,
        invoiceNumber: invoice.invoiceNumber,
        salesOrderNumber: invoice.salesOrder.salesOrderNumber,
        grandTotal: invoice.grandTotal.toFixed(2),
      },
      to,
      cc: mergeCc(dto.ccEmails || process.env.FINANCE_TEAM_EMAIL || undefined),
      attachments: [{ filename: `${invoice.invoiceNumber.replace(/\//g, '-')}.pdf`, content: pdf }],
      actorName,
      link: { module: 'TaxInvoice', taxInvoiceId: invoice.id },
    });

    const updated = await this.prisma.taxInvoice.update({
      where: { id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        sentBy: actorName,
        sentToEmail: to,
      },
      include: TAX_INVOICE_DETAIL_INCLUDE,
    });

    await this.auditLogService
      .record({
        module: 'TaxInvoice',
        recordId: id,
        action: 'Sent Email',
        actorName,
        newValue: { to, emailStatus: result.status },
      })
      .catch((error) => this.logger.error('AuditLog record failed', error));

    return { ...updated, emailStatus: result.status };
  }

  // Fiscal year (April 1 - March 31) + a plain numeric sequence per fiscal
  // year, formatted as `SRM/{fiscalYear}/{sequenceNumber}` — deliberately
  // NOT zero-padded (matches the reference "134", not "000134"), so the
  // next number is computed with a numeric MAX() aggregate rather than by
  // sorting the invoiceNumber string itself (see schema.prisma comment).
  private async generateInvoiceNumber(
    referenceDate: Date,
  ): Promise<{ invoiceNumber: string; fiscalYear: string; sequenceNumber: number }> {
    const fiscalYear = this.fiscalYearLabel(referenceDate);
    const aggregate = await this.prisma.taxInvoice.aggregate({
      where: { fiscalYear },
      _max: { sequenceNumber: true },
    });
    const floor = FISCAL_YEAR_SEQUENCE_FLOOR[fiscalYear] ?? 0;
    const sequenceNumber = Math.max(aggregate._max.sequenceNumber ?? 0, floor) + 1;
    return { invoiceNumber: `SRM/${fiscalYear}/${sequenceNumber}`, fiscalYear, sequenceNumber };
  }

  private fiscalYearLabel(date: Date): string {
    // April (month index 3) starts a new Indian fiscal year.
    const startYear = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
    const endYear = startYear + 1;
    return `${startYear}-${String(endYear).slice(-2)}`;
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
