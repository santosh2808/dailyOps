import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { mergeCc } from '../mailer/default-cc-emails';
import { ProformaInvoicePdfService } from '../pdf/proforma-invoice-pdf.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { WhatsAppService, type WhatsAppSendResult } from '../whatsapp/whatsapp.service';
import { backendBaseUrl } from '../common/backend-base-url';
import { MINIMUM_ADVANCE_PERCENT } from '../sales-orders/dispatch-override-approvers';
import { ApprovalRequestsService } from '../approval-requests/approval-requests.service';
import { CreateProformaInvoiceDto } from './dto/create-proforma-invoice.dto';
import { UpdateProformaInvoiceDto } from './dto/update-proforma-invoice.dto';
import { UpdateProformaInvoiceStatusDto } from './dto/update-proforma-invoice-status.dto';
import { UpdateProformaInvoiceAdvanceDto } from './dto/update-proforma-invoice-advance.dto';
import { SendProformaInvoiceDto } from './dto/send-proforma-invoice.dto';
import { QueryProformaInvoiceDto } from './dto/query-proforma-invoice.dto';

const INVOICE_NUMBER_PREFIX = 'PI-';
const INVOICE_NUMBER_PAD = 6;
const MAX_INVOICE_NUMBER_ATTEMPTS = 5;

// Passed by the controller from the JWT payload (req.user) — never trusted
// from the request body. `roles` drives the below-minimum-advance
// Administrator check in updateAdvance() below; `name` is the existing
// actor-display-name convention used everywhere else. Same shape/convention
// as SalesOrdersService's SalesOrderActor.
export interface ProformaInvoiceActor {
  name?: string;
  roles?: string[];
  // Additive: Override Approval workflow — see SalesOrderActor.email's
  // comment. Same purpose here.
  email?: string;
}

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
  // Additive: JEO-based tracking — see ProformaInvoice.jeoId schema
  // comment. Frozen at create() time, so this is a plain to-one include,
  // not something recomputed live.
  jeo: { select: { id: true, jeoNumber: true } },
} satisfies Prisma.ProformaInvoiceInclude;

const PROFORMA_INVOICE_LIST_INCLUDE = {
  customer: true,
  salesOrder: { select: { id: true, salesOrderNumber: true } },
  jeo: { select: { id: true, jeoNumber: true } },
} satisfies Prisma.ProformaInvoiceInclude;

@Injectable()
export class ProformaInvoicesService {
  private readonly logger = new Logger(ProformaInvoicesService.name);

  constructor(
    private prisma: PrismaService,
    private mailerService: MailerService,
    private proformaInvoicePdfService: ProformaInvoicePdfService,
    private auditLogService: AuditLogService,
    private whatsAppService: WhatsAppService,
    private approvalRequestsService: ApprovalRequestsService,
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
              // Staff track invoices day-to-day by JEO number, not by this
              // invoice's own number — see ProformaInvoice.jeoId comment.
              { jeo: { jeoNumber: { contains: search, mode: 'insensitive' } } },
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
    const salesOrder = await this.prisma.salesOrder.findUnique({
      where: { id: dto.salesOrderId },
      // Additive: JEO-based tracking — capture whichever JEO is currently
      // linked to this Sales Order (most recently created, any status) so
      // it can be frozen onto the invoice at create() time below. A Sales
      // Order can accumulate more than one JEO over its life (a completed
      // one doesn't block a later one), so "most recent" is the one that
      // actually corresponds to this invoice being generated now.
      include: { jobExecutionOrders: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!salesOrder) {
      throw new NotFoundException('Sales order not found');
    }
    // QA bug fix (SC-008): a cancelled Sales Order has nothing left to
    // invoice — generating a Proforma Invoice for it previously had no
    // guard at all. createFromSalesOrder() below routes through this same
    // check, but that path only ever runs on a freshly-accepted Quotation's
    // brand new Sales Order, so it can never actually hit this branch.
    if (salesOrder.status === 'CANCELLED') {
      throw new BadRequestException('A cancelled Sales Order cannot have a Proforma Invoice generated for it.');
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
            advanceReceived: dto.advanceReceived ?? 0,
            jeoId: salesOrder.jobExecutionOrders[0]?.id,
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

  // Bug-fix requirement: edit a Proforma Invoice's printed details even
  // after it's already been sent — sendInvoice() below has never blocked
  // resending, so "edit, then Resend to Customer" is the intended
  // fix-a-mistake flow. No status guard here, same as
  // QuotationsService.update() / TaxInvoicesService.update().
  async update(id: string, dto: UpdateProformaInvoiceDto, actorName?: string) {
    const existing = await this.findOne(id);
    const updated = await this.prisma.proformaInvoice.update({
      where: { id },
      data: {
        ...(dto.invoiceDate !== undefined ? { invoiceDate: new Date(dto.invoiceDate) } : {}),
        ...(dto.validUntil !== undefined ? { validUntil: dto.validUntil ? new Date(dto.validUntil) : null } : {}),
        ...(dto.paymentTerms !== undefined ? { paymentTerms: dto.paymentTerms } : {}),
        ...(dto.bankName !== undefined ? { bankName: dto.bankName } : {}),
        ...(dto.accountNumber !== undefined ? { accountNumber: dto.accountNumber } : {}),
        ...(dto.ifscCode !== undefined ? { ifscCode: dto.ifscCode } : {}),
        ...(dto.branch !== undefined ? { branch: dto.branch } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
      include: PROFORMA_INVOICE_DETAIL_INCLUDE,
    });
    await this.auditLogService
      .record({
        module: 'ProformaInvoice',
        recordId: id,
        action: 'Edited',
        actorName,
        oldValue: {
          invoiceDate: existing.invoiceDate,
          validUntil: existing.validUntil,
          paymentTerms: existing.paymentTerms,
          bankName: existing.bankName,
          accountNumber: existing.accountNumber,
          ifscCode: existing.ifscCode,
          branch: existing.branch,
          notes: existing.notes,
        },
        newValue: { ...dto },
      })
      .catch((error) => this.logger.error('AuditLog record failed', error));
    return updated;
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

  // Record/update the actual advance amount received against this invoice —
  // the one thing this schema had no way to update after creation (see
  // schema.prisma comment on advanceReceived). This is what the Sales Order
  // dispatch gate and Tax Invoice generation both check against.
  //
  // QA feature (SC-011): "Advance Payment Validation" — per the business
  // owner, the Quotation already asks for 50% advance by default, so
  // Record Advance Payment now enforces that same MINIMUM_ADVANCE_PERCENT
  // of the Sales Order's grandTotal at the point of entry, not just later
  // at the dispatch gate. Below that minimum (including a genuine "no
  // advance yet" case), the same two named DISPATCH_OVERRIDE_APPROVERS who
  // can already authorize a below-threshold dispatch may authorize this
  // too — and only an Administrator can record that authorization. Using a
  // percentage of grandTotal (rather than a flat rupee minimum) also means
  // the minimum can never exceed the order's own total, so there's no
  // separate "unless it's the last bit of the balance" carve-out needed —
  // paying the full remaining balance always satisfies the percentage on
  // its own.
  async updateAdvance(id: string, dto: UpdateProformaInvoiceAdvanceDto, actor: ProformaInvoiceActor = {}) {
    const actorName = actor.name;
    const existing = await this.findOne(id);
    // QA bug fix (SC-008): once the linked Sales Order is cancelled there's
    // nothing left to collect against — recording a new advance figure on
    // its Proforma Invoice previously had no guard against this at all.
    if (existing.salesOrder.status === 'CANCELLED') {
      throw new BadRequestException(
        'The linked Sales Order is cancelled — advance payment can no longer be recorded against it.',
      );
    }

    const requiredAdvance =
      existing.salesOrder.grandTotal > 0 ? (existing.salesOrder.grandTotal * MINIMUM_ADVANCE_PERCENT) / 100 : 0;

    if (dto.advanceReceived < requiredAdvance) {
      // Override Approval workflow: below the 50% minimum, recording the
      // advance no longer proceeds on a self-declared "Approved By" name —
      // it raises (or reuses) a real OverrideApprovalRequest and emails
      // Santosh Kumar Chegondi / Amarpal Gampa a one-click approve/reject
      // link. The figure stays unsaved — this throws immediately below —
      // until one of them actually approves it, at which point
      // ApprovalDecisionsService calls applyApprovedAdvance() to write it.
      await this.approvalRequestsService.createRequest({
        type: 'PROFORMA_INVOICE_ADVANCE',
        salesOrderId: existing.salesOrderId,
        proformaInvoiceId: id,
        actionPayload: { advanceReceived: dto.advanceReceived },
        advanceReceived: dto.advanceReceived,
        requiredAdvance,
        requestedByName: actorName,
        requestedByEmail: actor.email,
        actionSummary: `Record ₹${dto.advanceReceived.toLocaleString('en-IN')} advance on Proforma Invoice ${existing.invoiceNumber}`,
      });
      throw new ConflictException(
        `Advance amount (₹${dto.advanceReceived.toLocaleString('en-IN')}) is below the required ${MINIMUM_ADVANCE_PERCENT}% of the order total (₹${requiredAdvance.toLocaleString('en-IN')}). An approval request has been emailed to Santosh Kumar Chegondi and Amarpal Gampa — this amount will be recorded automatically once one of them approves it, or record at least the required amount instead.`,
      );
    }
    // advanceReceived >= requiredAdvance: proceed normally.

    return this.performAdvanceUpdate(id, existing, dto.advanceReceived, actorName, null);
  }

  // Shared write path for the advance figure itself — used both by
  // updateAdvance() above (gate already satisfied) and by
  // applyApprovedAdvance() below (a real Santosh/Amarpal approval has now
  // been recorded for a below-minimum figure). Mirrors
  // SalesOrdersService.performStatusChange()'s split for the same reason.
  private async performAdvanceUpdate(
    id: string,
    existing: { advanceReceived: number },
    advanceReceived: number,
    actorName: string | undefined,
    override: { approvedBy: string; by: string | null; note: string | null; at: Date } | null,
  ) {
    const updated = await this.prisma.proformaInvoice.update({
      where: { id },
      data: {
        advanceReceived,
        advanceOverrideNote: override?.note ?? null,
        advanceOverrideBy: override?.by ?? null,
        advanceOverrideApprovedBy: override?.approvedBy ?? null,
        advanceOverrideAt: override?.at ?? null,
      },
      include: PROFORMA_INVOICE_DETAIL_INCLUDE,
    });
    await this.auditLogService
      .record({
        module: 'ProformaInvoice',
        recordId: id,
        action: 'Advance Received Updated',
        actorName,
        oldValue: { advanceReceived: existing.advanceReceived },
        newValue: { advanceReceived: updated.advanceReceived, advanceOverrideApprovedBy: override?.approvedBy ?? null },
      })
      .catch((error) => this.logger.error('AuditLog record failed', error));
    return updated;
  }

  // Called by ApprovalDecisionsService once a PROFORMA_INVOICE_ADVANCE
  // OverrideApprovalRequest has actually been approved by Santosh or
  // Amarpal via the emailed public link.
  async applyApprovedAdvance(request: {
    proformaInvoiceId: string | null;
    actionPayload: unknown;
    decidedApprover: string | null;
    requestedByName: string | null;
    decisionNote: string | null;
    decidedAt: Date | null;
  }) {
    if (!request.proformaInvoiceId) {
      throw new BadRequestException('Approval request is missing its Proforma Invoice.');
    }
    const advanceReceived = (request.actionPayload as { advanceReceived?: number } | null)?.advanceReceived;
    if (typeof advanceReceived !== 'number') {
      throw new BadRequestException('Approval request is missing its advance amount.');
    }
    const existing = await this.findOne(request.proformaInvoiceId);
    if (existing.salesOrder.status === 'CANCELLED') {
      throw new BadRequestException(
        'The linked Sales Order is cancelled — advance payment can no longer be recorded against it.',
      );
    }
    return this.performAdvanceUpdate(request.proformaInvoiceId, existing, advanceReceived, request.requestedByName ?? undefined, {
      approvedBy: request.decidedApprover ?? '',
      by: request.requestedByName ?? null,
      note: request.decisionNote,
      at: request.decidedAt ?? new Date(),
    });
  }

  // QA bug fix (SC-006): subtotal/discount/tax/grandTotal are copied onto
  // the invoice once, at create() time above — they're a snapshot, not a
  // live reference. Editing the Sales Order afterward (product, quantity,
  // price, discount) recomputes SalesOrder.grandTotal but nothing here
  // ever re-syncs this invoice's own copy, so the two silently drift apart
  // (made worse by items/addresses being read live off the Sales Order —
  // see PROFORMA_INVOICE_DETAIL_INCLUDE's comment — so the invoice can end
  // up showing new items next to an old total). This gives staff an
  // explicit action to pull the current Sales Order amounts back in.
  //
  // Deliberately does NOT touch advanceReceived: money already recorded as
  // received is a fact about what happened, not a derived total, so it
  // must survive a regenerate untouched even if the new grandTotal makes
  // the advance a different percentage than before. It also does not
  // touch jeoId (frozen-at-create by design, see that field's own
  // comment) or any of the manually-edited metadata fields update() above
  // handles (paymentTerms/bank details/notes) — those are the user's own
  // edits, not something a Sales Order change should silently overwrite.
  async regenerateFromSalesOrder(id: string, actorName?: string) {
    const existing = await this.findOne(id);
    if (existing.status === 'CANCELLED') {
      throw new BadRequestException('A cancelled Proforma Invoice cannot be regenerated.');
    }

    const salesOrder = await this.prisma.salesOrder.findUnique({
      where: { id: existing.salesOrderId },
    });
    if (!salesOrder) {
      throw new NotFoundException('The linked Sales Order no longer exists.');
    }

    const updated = await this.prisma.proformaInvoice.update({
      where: { id },
      data: {
        subtotal: salesOrder.subtotal,
        discount: salesOrder.discount,
        tax: salesOrder.tax,
        grandTotal: salesOrder.grandTotal,
      },
      include: PROFORMA_INVOICE_DETAIL_INCLUDE,
    });
    await this.auditLogService
      .record({
        module: 'ProformaInvoice',
        recordId: id,
        action: 'Regenerated from Sales Order',
        actorName,
        oldValue: {
          subtotal: existing.subtotal,
          discount: existing.discount,
          tax: existing.tax,
          grandTotal: existing.grandTotal,
        },
        newValue: {
          subtotal: updated.subtotal,
          discount: updated.discount,
          tax: updated.tax,
          grandTotal: updated.grandTotal,
        },
      })
      .catch((error) => this.logger.error('AuditLog record failed', error));
    return updated;
  }

  // Branded PDF (replicates "Proforma Invoice 001.doc") — used both for the
  // standalone GET :id/pdf download and internally by sendInvoiceEmail()'s
  // attachment, so the emailed copy and the on-demand download are always
  // byte-for-byte the same document.
  async getPdf(id: string): Promise<Buffer> {
    const invoice = await this.findOne(id);
    return this.proformaInvoicePdfService.render(this.toPdfInput(invoice));
  }

  // Additive: WhatsApp Share. publicToken isn't part of the generated
  // Prisma Client types in this environment (schema was hand-migrated —
  // see the migration's own comment), so it's read/written with raw SQL
  // rather than the typed client, same as ProformaInvoice.publicToken's
  // schema comment describes. Lazily generates the token the first time
  // it's needed (staff clicks "Share via WhatsApp") and reuses it on every
  // later click — one stable link per invoice, not regenerated per share
  // like Quotation's (which regenerates on every resend for its own
  // negotiation-workflow reasons that don't apply here).
  async getOrCreatePublicToken(id: string): Promise<string> {
    const rows = await this.prisma.$queryRaw<{ publicToken: string | null }[]>`
      SELECT "publicToken" FROM "ProformaInvoice" WHERE id = ${id}
    `;
    if (!rows.length) {
      throw new NotFoundException(`Proforma Invoice ${id} not found`);
    }
    if (rows[0].publicToken) {
      return rows[0].publicToken;
    }
    const token = crypto.randomBytes(24).toString('base64url');
    await this.prisma.$executeRaw`
      UPDATE "ProformaInvoice" SET "publicToken" = ${token} WHERE id = ${id}
    `;
    return token;
  }

  // The no-guard counterpart to getPdf(id) above, reached via publicToken
  // instead of the record's own id/JWT — see PublicProformaInvoicesController.
  async getPublicPdf(token: string): Promise<Buffer> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "ProformaInvoice" WHERE "publicToken" = ${token}
    `;
    if (!rows.length) {
      throw new NotFoundException('Invalid or expired link');
    }
    return this.getPdf(rows[0].id);
  }

  // Additive: WhatsApp Share via Interakt — replaces the earlier
  // click-to-chat button with a real send. Builds the same public PDF link
  // getPublicPdf() above serves, then hands it to WhatsAppService as the
  // template's last body variable. INTERAKT_PROFORMA_INVOICE_TEMPLATE_NAME
  // must match a template already created and approved in Interakt (see
  // .env.example for the suggested wording to submit for approval).
  async sendWhatsAppShare(id: string): Promise<WhatsAppSendResult & { phone?: string | null }> {
    const invoice = await this.findOne(id);
    const phone = invoice.customer?.phone ?? null;
    const token = await this.getOrCreatePublicToken(id);
    const link = `${backendBaseUrl()}/api/v1/public/proforma-invoices/${token}/pdf`;
    const templateName = process.env.INTERAKT_PROFORMA_INVOICE_TEMPLATE_NAME?.trim() || 'proforma_invoice_share';
    const result = await this.whatsAppService.sendTemplateMessage({
      phone,
      templateName,
      bodyValues: [invoice.customer?.contactPerson || 'Customer', invoice.invoiceNumber, link],
    });
    return { ...result, phone };
  }

  private toPdfInput(
    invoice: Prisma.ProformaInvoiceGetPayload<{ include: typeof PROFORMA_INVOICE_DETAIL_INCLUDE }>,
  ) {
    // taxPercent isn't a stored column anywhere (SalesOrder/ProformaInvoice
    // only snapshot the tax *amount*) — derived here from the snapshotted
    // subtotal/discount/tax the same way the printed template's "GST %"
    // column is meant to read, rather than adding a new schema field for a
    // value that's always mechanically recomputable from what's already
    // stored.
    const taxableAmount = invoice.subtotal - invoice.discount;
    const taxPercent = taxableAmount > 0 ? Math.round((invoice.tax / taxableAmount) * 10000) / 100 : 0;

    return {
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      customer: {
        companyName: invoice.customer.companyName,
        contactPerson: invoice.customer.contactPerson,
        phone: invoice.customer.phone,
        gstNumber: invoice.customer.gstNumber,
        state: invoice.customer.state,
      },
      billingAddress: invoice.salesOrder.billingAddress,
      items: invoice.salesOrder.items.map((item) => ({
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        description: item.description,
        product: { name: item.product.name },
      })),
      subtotal: invoice.subtotal,
      taxPercent,
      tax: invoice.tax,
      grandTotal: invoice.grandTotal,
      advanceReceived: invoice.advanceReceived,
      paymentTerms: invoice.paymentTerms,
      bankName: invoice.bankName,
      accountNumber: invoice.accountNumber,
      ifscCode: invoice.ifscCode,
      branch: invoice.branch,
      notes: invoice.notes,
    };
  }

  // Best-effort auto-send at generation time (requirement #12) — errors are
  // swallowed/logged rather than failing create() itself, same as JEO's
  // sendFactoryNotificationEmail(). For the explicit on-demand resend, see
  // the public sendInvoice() below, which shares this same email payload
  // but lets errors propagate (an explicit user action should surface a
  // failure, not silently swallow it).
  private async sendInvoiceEmail(
    invoice: Prisma.ProformaInvoiceGetPayload<{ include: typeof PROFORMA_INVOICE_DETAIL_INCLUDE }>,
    actorName?: string,
  ) {
    try {
      await this.mailerService.send(await this.buildInvoiceEmailPayload(invoice, actorName));
    } catch (error) {
      this.logger.error(`Proforma Invoice email failed for ${invoice.id}`, error);
    }
  }

  private async buildInvoiceEmailPayload(
    invoice: Prisma.ProformaInvoiceGetPayload<{ include: typeof PROFORMA_INVOICE_DETAIL_INCLUDE }>,
    actorName?: string,
    overrides?: { to?: string; cc?: string },
  ) {
    const pdf = await this.proformaInvoicePdfService.render(this.toPdfInput(invoice));
    return {
      templateKey: 'PROFORMA_INVOICE',
      fallbackSubject: `Proforma Invoice ${invoice.invoiceNumber}`,
      fallbackBodyHtml: `<p>Dear {{customerName}},</p><p>Please find attached Proforma Invoice {{invoiceNumber}} for Sales Order {{salesOrderNumber}}. Grand total: {{grandTotal}}.</p>`,
      vars: {
        customerName: invoice.customer.contactPerson,
        invoiceNumber: invoice.invoiceNumber,
        salesOrderNumber: invoice.salesOrder.salesOrderNumber,
        grandTotal: invoice.grandTotal.toFixed(2),
      },
      to: overrides?.to ?? invoice.customer.email,
      // "CC Finance" (requirement #12) — env-configurable so this isn't a
      // hardcoded address; unset simply means no CC is added.
      cc: mergeCc(overrides?.cc ?? (process.env.FINANCE_TEAM_EMAIL || undefined)),
      attachments: [{ filename: `${invoice.invoiceNumber}.pdf`, content: pdf }],
      actorName,
      link: { module: 'ProformaInvoice', proformaInvoiceId: invoice.id },
    };
  }

  // Bug-fix requirement: explicit, on-demand (re)send — the only send
  // mechanism before this was the private auto-fire inside create(), so a
  // mistake on the first send (wrong recipient, stale details before an
  // edit) had no in-app fix. Mirrors TaxInvoicesService.sendInvoice()
  // exactly: only CANCELLED blocks it, lets the sender override
  // recipient/CC for this send only, and — unlike the best-effort
  // create()-time send — propagates a failure instead of swallowing it,
  // since this is an explicit user action.
  async sendInvoice(id: string, dto: SendProformaInvoiceDto, actorName?: string) {
    const invoice = await this.findOne(id);
    if (invoice.status === 'CANCELLED') {
      throw new BadRequestException('A cancelled Proforma Invoice cannot be sent');
    }

    const to = dto.recipientEmail?.trim() || invoice.customer.email || undefined;
    const result = await this.mailerService.send(
      await this.buildInvoiceEmailPayload(invoice, actorName, { to, cc: dto.ccEmails }),
    );

    const updated = await this.prisma.proformaInvoice.update({
      where: { id },
      // Only ever advances DRAFT -> SENT; a resend while already SENT/
      // EXPIRED leaves status untouched — resending isn't itself a status
      // transition, same as TaxInvoice's status only ever moving once.
      data: invoice.status === 'DRAFT' ? { status: 'SENT' } : {},
      include: PROFORMA_INVOICE_DETAIL_INCLUDE,
    });

    await this.auditLogService
      .record({
        module: 'ProformaInvoice',
        recordId: id,
        action: 'Sent Email',
        actorName,
        newValue: { to, emailStatus: result.status },
      })
      .catch((error) => this.logger.error('AuditLog record failed', error));

    return { ...updated, emailStatus: result.status };
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
