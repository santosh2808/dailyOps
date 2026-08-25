import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SalesOrdersService } from '../sales-orders/sales-orders.service';
import { ProformaInvoicesService } from '../proforma-invoices/proforma-invoices.service';
import { JobExecutionOrdersService } from '../job-execution-orders/job-execution-orders.service';
import { ApprovalMatrixService } from '../approval-matrix/approval-matrix.service';
import { MailerService } from '../mailer/mailer.service';
import { QuotationPdfService } from '../pdf/quotation-pdf.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { LeadsService } from '../leads/leads.service';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';
import { UpdateQuotationStatusDto } from './dto/update-quotation-status.dto';
import { QueryQuotationDto } from './dto/query-quotation.dto';
import { QuotationItemInputDto } from './dto/quotation-item-input.dto';
import { RequestQuotationApprovalDto } from './dto/request-quotation-approval.dto';
import { DecideQuotationApprovalDto } from './dto/decide-quotation-approval.dto';
import { SendQuotationDto } from './dto/send-quotation.dto';

// Passed by the controller from the JWT payload (req.user) — never trusted
// from the request body. `roles` drives the Approval Matrix / Administrator
// override checks below; `name` is the existing actor-display-name
// convention used everywhere else in this codebase.
export interface QuotationActor {
  name?: string;
  roles?: string[];
}

// Techno-Commercial Offer PDF template: switched quotation numbering to
// match the customer-supplied reference format "SR|SPYRO|QTN|<seq>|<year>"
// going forward. Deliberately NOT the old "QT-2026-000002" per-year-reset
// scheme (see the old generateQuotationNumber() this replaced) — this is a
// single running sequence across all years, matching the "108" style
// booking number in the reference document, not one that resets to 1 every
// January. Existing quotation numbers already issued keep their old format
// forever; nothing renumbers them retroactively.
const MAX_QUOTATION_NUMBER_ATTEMPTS = 5;
const DEFAULT_GST_PERCENT = 18;
// Installation is Rs.8,000 per fan, auto-computed from total item quantity
// unless a quotation explicitly overrides installationCharge. Transportation
// has no equivalent rate — it varies by site/distance — so it's never
// auto-computed, only ever taken from what was supplied (defaulting to 0).
const INSTALLATION_RATE_PER_FAN = 8000;

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
  // Lead Management Phase 1: present whenever this quotation was generated
  // directly from a Lead (customer is then null — see schema comment).
  lead: true,
  items: { include: { product: true } },
} satisfies Prisma.QuotationInclude;

const QUOTATION_LIST_INCLUDE = {
  customer: true,
  lead: true,
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
  installationCharge: number;
  transportationCharge: number;
  gstAmount: number;
  grandTotal: number;
}

@Injectable()
export class QuotationsService {
  private readonly logger = new Logger(QuotationsService.name);

  constructor(
    private prisma: PrismaService,
    private salesOrdersService: SalesOrdersService,
    private proformaInvoicesService: ProformaInvoicesService,
    private jobExecutionOrdersService: JobExecutionOrdersService,
    private approvalMatrixService: ApprovalMatrixService,
    private mailerService: MailerService,
    private quotationPdfService: QuotationPdfService,
    private auditLogService: AuditLogService,
    private leadsService: LeadsService,
  ) {}

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

  // Lead Management Phase 1 (requirement #8): exactly one of
  // dto.customerId / dto.leadId is expected. When leadId is given —
  // "Generate Quotation" from a Qualified lead — this never accepts items
  // from the request body; they're always derived from the Lead's own
  // linked products (LeadProduct), the same way LeadsService.create()
  // already defaults a product's unitPrice when the lead itself was
  // created. This also means Generate Quotation is a true one-click
  // action: nothing to fill in, nothing to get wrong.
  async create(dto: CreateQuotationDto, actorName?: string) {
    if (!dto.customerId && !dto.leadId) {
      throw new BadRequestException('Either customerId or leadId is required to create a quotation');
    }
    if (dto.customerId && dto.leadId) {
      throw new BadRequestException('Provide only one of customerId or leadId, not both');
    }

    let itemsInput: QuotationItemInputDto[];
    if (dto.leadId) {
      const lead = await this.leadsService.getLeadForQuotationGeneration(dto.leadId);
      itemsInput = lead.products.map((p) => ({
        productId: p.productId,
        description: p.remarks ?? undefined,
        quantity: p.quantity,
        unitPrice: p.unitPrice ?? undefined,
      }));
    } else {
      if (!dto.items || dto.items.length === 0) {
        throw new BadRequestException('A quotation needs at least one item');
      }
      itemsInput = dto.items;
    }

    const totals = await this.computeTotals(
      itemsInput,
      dto.gstPercent,
      dto.installationCharge,
      dto.transportationCharge,
    );

    for (let attempt = 1; attempt <= MAX_QUOTATION_NUMBER_ATTEMPTS; attempt++) {
      const quotationNumber = await this.generateQuotationNumber(dto.commercialTerms?.regionCode);
      try {
        const created = await this.prisma.quotation.create({
          data: {
            quotationNumber,
            customerId: dto.customerId,
            leadId: dto.leadId,
            status: dto.status,
            subtotal: totals.subtotal,
            gstPercent: totals.gstPercent,
            installationCharge: totals.installationCharge,
            transportationCharge: totals.transportationCharge,
            gstAmount: totals.gstAmount,
            grandTotal: totals.grandTotal,
            validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
            notes: dto.notes,
            terms: dto.terms,
            commercialTerms: dto.commercialTerms as Prisma.InputJsonValue | undefined,
            items: { create: totals.items },
          },
          include: QUOTATION_DETAIL_INCLUDE,
        });
        await this.auditLogService
          .record({
            module: 'Quotation',
            recordId: created.id,
            action: 'Created',
            actorName,
            newValue: { quotationNumber: created.quotationNumber, grandTotal: created.grandTotal },
          })
          .catch((error) => this.logger.error('AuditLog record failed', error));
        if (dto.leadId) {
          await this.leadsService
            .recordQuotationGenerated(dto.leadId, created.quotationNumber, actorName)
            .catch((error) => this.logger.error('Lead Timeline entry for Generate Quotation failed', error));
        }
        return created;
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

    // Recompute totals whenever items, gstPercent, installationCharge, or
    // transportationCharge are touched. If none of those are supplied, keep
    // the existing stored totals untouched. Note: if only gstPercent (say)
    // changes and installationCharge is untouched, we still need to
    // recompute using the EXISTING installationCharge as an explicit
    // override rather than letting computeTotals silently recompute it from
    // quantity again — that would wrongly reset a previously-overridden
    // installation rate just because the items array itself didn't change.
    const shouldRecompute =
      dto.items !== undefined ||
      dto.gstPercent !== undefined ||
      dto.installationCharge !== undefined ||
      dto.transportationCharge !== undefined;
    // installationCharge: only carry forward the existing stored amount as
    // an explicit override when items AREN'T changing (quantity is the same,
    // so the previous amount — whether auto-computed or manually overridden
    // — is still valid). If items ARE changing and no explicit
    // installationCharge was sent, pass undefined so computeTotals
    // re-derives Rs.8,000 x the new total quantity instead of freezing a now
    // stale absolute amount from the old quantity.
    const installationOverride =
      dto.installationCharge !== undefined
        ? dto.installationCharge
        : dto.items === undefined
          ? existing.installationCharge
          : undefined;
    const totals = shouldRecompute
      ? await this.computeTotals(
          dto.items ?? this.toItemInput(existing.items),
          dto.gstPercent ?? existing.gstPercent,
          installationOverride,
          dto.transportationCharge ?? existing.transportationCharge,
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
          ...(dto.commercialTerms !== undefined
            ? { commercialTerms: dto.commercialTerms as Prisma.InputJsonValue }
            : {}),
          ...(totals
            ? {
                subtotal: totals.subtotal,
                gstPercent: totals.gstPercent,
                installationCharge: totals.installationCharge,
                transportationCharge: totals.transportationCharge,
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

  // Required Workflow: Lead -> Quotation -> Quotation Approved -> Convert
  // to Customer -> Automatically Create Sales Order -> Automatically
  // Generate Proforma Invoice -> Automatically Generate JEO -> Notify
  // Factory -> Redirect to Sales Order Details. The "Approved" step is
  // this exact status transition (gated by Quotation.Approve in the
  // controller); the moment it lands on ACCEPTED — and only on that
  // transition, never on a re-save of an already-Accepted quotation — the
  // full cascade below runs. Price Validation / Approval Matrix
  // (requirements #8/#9) gate the transition itself: assertCanAccept()
  // throws before anything is written if the quotation isn't allowed to be
  // accepted yet. The returned `salesOrder` field is purely additive on top
  // of the existing Quotation response shape, so any caller that only
  // reads quotation fields is unaffected; QuotationDetails.tsx uses it to
  // redirect straight to the new Sales Order's detail page.
  async updateStatus(id: string, dto: UpdateQuotationStatusDto, actor: QuotationActor = {}) {
    const existing = await this.findOne(id);

    if (dto.status === 'ACCEPTED' && existing.status !== 'ACCEPTED') {
      // Lead Management Phase 1 boundary (requirement #14): Customer
      // Acceptance / Sales Order / PI / JEO are Phase 2. A quotation that
      // was generated straight from a Lead (no customerId yet — that only
      // gets set once the not-yet-built Phase 2 "Convert to Customer" step
      // runs) can never reach ACCEPTED, so the whole cascade below it stays
      // unreachable from this workflow. This applies even to
      // Administrators — it's a phase boundary, not a pricing/approval
      // rule, so it isn't something any role should be able to bypass.
      if (!existing.customerId) {
        throw new BadRequestException(
          'This quotation is linked to a Lead and has no Customer yet. Customer acceptance and Sales Order creation are part of Phase 2 and are not available yet.',
        );
      }
      await this.assertCanAccept(existing, actor.roles ?? []);
      const { quotation, salesOrder } = await this.performAccept(id, actor.name);
      return { ...quotation, salesOrder };
    }

    const quotation = await this.prisma.quotation.update({
      where: { id },
      data: { status: dto.status },
      include: QUOTATION_DETAIL_INCLUDE,
    });
    await this.auditLogService
      .record({
        module: 'Quotation',
        recordId: id,
        action: 'Status Changed',
        actorName: actor.name,
        oldValue: { status: existing.status },
        newValue: { status: dto.status },
      })
      .catch((error) => this.logger.error('AuditLog record failed', error));

    return { ...quotation, salesOrder: null };
  }

  // Price Validation (requirement #8) + Approval Matrix (requirement #9).
  // Administrators always bypass both checks — same systemic invariant
  // used throughout this codebase's RBAC (Administrator holds every
  // permission via seed.ts; this is the equivalent for a business-rule
  // gate rather than a route permission). Anyone else who is blocked here
  // must either fix the price (Update Price) or escalate via
  // requestApproval() (Request Approval) — there is no other way past this
  // method.
  private async assertCanAccept(
    quotation: Prisma.QuotationGetPayload<{ include: typeof QUOTATION_DETAIL_INCLUDE }>,
    actorRoles: string[],
  ) {
    if (actorRoles.includes('Administrator')) {
      return;
    }

    const belowMinItems = quotation.items.filter(
      (item) => item.product.minPrice != null && item.unitPrice < item.product.minPrice,
    );
    if (belowMinItems.length > 0) {
      throw new BadRequestException({
        code: 'PRICE_BELOW_MINIMUM',
        message:
          'One or more items are priced below the minimum allowed price. Update the price or submit an approval request.',
        items: belowMinItems.map((item) => ({
          productId: item.productId,
          productName: item.product.name,
          enteredPrice: item.unitPrice,
          minimumPrice: item.product.minPrice,
          difference: Math.round(((item.product.minPrice ?? 0) - item.unitPrice) * 100) / 100,
        })),
      });
    }

    const discountPercent = this.computeDiscountPercent(quotation);
    const requiredRole = await this.approvalMatrixService.resolveRequiredRole('Quotation', discountPercent);
    if (requiredRole && !actorRoles.includes(requiredRole.name)) {
      throw new BadRequestException({
        code: 'APPROVAL_REQUIRED',
        message: `This quotation's discount (${discountPercent.toFixed(1)}%) requires approval from ${requiredRole.name}.`,
        discountPercent,
        requiredRole: requiredRole.name,
      });
    }
  }

  // Highest per-item discount % against that item's own product
  // standardPrice — items whose product has no standardPrice configured
  // simply don't contribute a percentage (see the Product.standardPrice
  // schema comment: "optional... no check ever fires for it").
  private computeDiscountPercent(
    quotation: Prisma.QuotationGetPayload<{ include: typeof QUOTATION_DETAIL_INCLUDE }>,
  ): number {
    const percents = quotation.items
      .filter((item) => item.product.standardPrice && item.product.standardPrice > 0)
      .map((item) =>
        Math.max(0, ((item.product.standardPrice! - item.unitPrice) / item.product.standardPrice!) * 100),
      );
    return percents.length > 0 ? Math.max(...percents) : 0;
  }

  // The role required to decide a given QuotationApprovalRequest — always
  // Administrator for a below-minimum-price escalation (a hard floor, not
  // a discount bracket), otherwise whatever the Approval Matrix says for
  // that request's snapshotted discount %.
  private async resolveRequiredApproverName(request: { belowMinPrice: boolean; discountPercent: number | null }) {
    if (request.belowMinPrice) {
      return 'Administrator';
    }
    const role = await this.approvalMatrixService.resolveRequiredRole('Quotation', request.discountPercent ?? 0);
    return role?.name ?? 'Administrator';
  }

  // Sales rep escalation (the "Request Approval" button — requirement #8)
  // when assertCanAccept() has blocked them. Snapshots exactly why (below
  // minimum price and/or the computed discount %) at request time, so the
  // eventual decision reflects the pricing that was actually requested even
  // if the quotation's items are edited afterwards.
  async requestApproval(id: string, dto: RequestQuotationApprovalDto, actor: QuotationActor = {}) {
    const quotation = await this.findOne(id);

    const existingPending = await this.prisma.quotationApprovalRequest.findFirst({
      where: { quotationId: id, status: 'PENDING' },
    });
    if (existingPending) {
      throw new ConflictException('An approval request is already pending for this quotation');
    }

    const belowMinPrice = quotation.items.some(
      (item) => item.product.minPrice != null && item.unitPrice < item.product.minPrice,
    );
    const discountPercent = this.computeDiscountPercent(quotation);

    const request = await this.prisma.quotationApprovalRequest.create({
      data: {
        quotationId: id,
        requestedBy: actor.name,
        reason: dto.reason,
        discountPercent,
        belowMinPrice,
      },
    });

    await this.auditLogService
      .record({
        module: 'Quotation',
        recordId: id,
        action: 'Approval Requested',
        actorName: actor.name,
        newValue: { discountPercent, belowMinPrice, reason: dto.reason },
      })
      .catch((error) => this.logger.error('AuditLog record failed', error));

    return request;
  }

  listApprovalRequests(status?: string) {
    return this.prisma.quotationApprovalRequest.findMany({
      where: status ? { status } : undefined,
      include: { quotation: { include: QUOTATION_DETAIL_INCLUDE } },
      orderBy: { requestedAt: 'desc' },
    });
  }

  // Deciding a request is the ONLY path past assertCanAccept()'s block
  // besides fixing the price. Approving performs the ACCEPTED transition
  // (and its full cascade) directly — the requester never has to separately
  // click "Approve" again afterwards.
  async decideApprovalRequest(
    requestId: string,
    dto: DecideQuotationApprovalDto,
    actor: QuotationActor = {},
  ) {
    const request = await this.prisma.quotationApprovalRequest.findUnique({ where: { id: requestId } });
    if (!request) {
      throw new NotFoundException('Approval request not found');
    }
    if (request.status !== 'PENDING') {
      throw new ConflictException('This approval request has already been decided');
    }

    if (!(actor.roles ?? []).includes('Administrator')) {
      const requiredRoleName = await this.resolveRequiredApproverName(request);
      if (!(actor.roles ?? []).includes(requiredRoleName)) {
        throw new ForbiddenException(
          `Only ${requiredRoleName} or Administrator can decide this approval request`,
        );
      }
    }

    await this.prisma.quotationApprovalRequest.update({
      where: { id: requestId },
      data: {
        status: dto.approve ? 'APPROVED' : 'REJECTED',
        decidedBy: actor.name,
        decidedAt: new Date(),
        decisionRemarks: dto.remarks,
      },
    });

    await this.auditLogService
      .record({
        module: 'Quotation',
        recordId: request.quotationId,
        action: dto.approve ? 'Approval Granted' : 'Approval Rejected',
        actorName: actor.name,
        remarks: dto.remarks,
      })
      .catch((error) => this.logger.error('AuditLog record failed', error));

    if (!dto.approve) {
      return { status: 'REJECTED' as const };
    }

    const { quotation, salesOrder } = await this.performAccept(request.quotationId, actor.name);
    return { status: 'APPROVED' as const, quotation, salesOrder };
  }

  // The actual ACCEPTED transition + full downstream cascade, shared by
  // both updateStatus() (the normal self-approval path) and
  // decideApprovalRequest() (the escalated path) so there is exactly one
  // place this ever happens. Sales Order / Proforma Invoice / JEO creation
  // are each individually idempotent (see their own createFromQuotation()/
  // createFromSalesOrder() methods) and the PI/JEO steps are best-effort —
  // a failure generating either one is logged but never rolls back the
  // Accept itself or blocks the other step, since by this point the
  // Quotation has already been legitimately accepted and a Sales Order
  // already exists; the customer/factory should not lose that because of
  // an unrelated PDF/email hiccup. Any failure is still visible via
  // EmailHistory (status FAILED) and the server log.
  private async performAccept(quotationId: string, actorName?: string) {
    const quotation = await this.prisma.quotation.update({
      where: { id: quotationId },
      data: { status: 'ACCEPTED' },
      include: QUOTATION_DETAIL_INCLUDE,
    });

    await this.auditLogService
      .record({
        module: 'Quotation',
        recordId: quotationId,
        action: 'Status Changed',
        actorName,
        newValue: { status: 'ACCEPTED' },
      })
      .catch((error) => this.logger.error('AuditLog record failed', error));

    const createdSalesOrder = await this.salesOrdersService.createFromQuotation(quotationId, actorName);

    try {
      await this.proformaInvoicesService.createFromSalesOrder(createdSalesOrder.id, actorName);
    } catch (error) {
      this.logger.error(
        `Automatic Proforma Invoice generation failed for Sales Order ${createdSalesOrder.id}`,
        error,
      );
    }

    try {
      await this.jobExecutionOrdersService.createFromSalesOrder(createdSalesOrder.id);
    } catch (error) {
      this.logger.error(`Automatic JEO generation failed for Sales Order ${createdSalesOrder.id}`, error);
    }

    return {
      quotation,
      salesOrder: { id: createdSalesOrder.id, salesOrderNumber: createdSalesOrder.salesOrderNumber },
    };
  }

  // Send Quotation (requirement #6): generates the PDF, sends the email
  // (customer, optionally CC'd), records EmailHistory (inside
  // MailerService.send()), and stamps sentAt/sentBy/sentToEmail — never
  // any other quotation field. Blocked once the quotation has reached a
  // terminal-ish state (Accepted/Rejected/Expired have already been
  // decided; there's nothing left to "send").
  async sendQuotation(id: string, dto: SendQuotationDto, actor: QuotationActor = {}) {
    const quotation = await this.findOne(id);
    if (['ACCEPTED', 'REJECTED', 'EXPIRED'].includes(quotation.status)) {
      throw new BadRequestException(`A quotation with status ${quotation.status} cannot be sent`);
    }

    // Lead-sourced quotations (customer null, leadId set) have no
    // Customer record yet — fall back to the Lead's own contact fields for
    // recipient/name so Send Quotation works identically for both origins.
    const recipientName = quotation.customer?.contactPerson ?? quotation.lead?.contactPerson ?? 'Customer';
    const recipientEmail = quotation.customer?.email ?? quotation.lead?.email ?? undefined;
    const to = dto.recipientEmail?.trim() || recipientEmail || undefined;
    const pdf = await this.quotationPdfService.render(quotation);

    const result = await this.mailerService.send({
      templateKey: 'QUOTATION',
      fallbackSubject: `Quotation ${quotation.quotationNumber} from Smart Rotamac`,
      fallbackBodyHtml: `<p>Dear {{customerName}},</p><p>Please find attached Quotation {{quotationNumber}}, total amount {{grandTotal}}.</p>`,
      vars: {
        customerName: recipientName,
        quotationNumber: quotation.quotationNumber,
        grandTotal: quotation.grandTotal.toFixed(2),
      },
      to,
      cc: dto.ccEmails,
      // Pipes in "SR|SPYRO|QTN|108|2026" are not safe filename characters on
      // every platform — sanitize for the attachment name only; the
      // quotationNumber displayed on the PDF itself/on-screen is untouched.
      attachments: [{ filename: `${this.sanitizeForFilename(quotation.quotationNumber)}.pdf`, content: pdf }],
      actorName: actor.name,
      link: { module: 'Quotation', quotationId: id },
    });

    const updated = await this.prisma.quotation.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date(), sentBy: actor.name, sentToEmail: to },
      include: QUOTATION_DETAIL_INCLUDE,
    });

    await this.auditLogService
      .record({
        module: 'Quotation',
        recordId: id,
        action: 'Sent Email',
        actorName: actor.name,
        newValue: { to, emailStatus: result.status },
      })
      .catch((error) => this.logger.error('AuditLog record failed', error));

    // Lead Management Phase 1 (requirement #10): sending a lead-sourced
    // quotation advances the Lead itself to QUOTATION_SENT + Timeline
    // entry. No-op (via recordQuotationSent's own guard) for
    // customer-sourced quotations, since quotation.leadId is null there.
    if (quotation.leadId) {
      await this.leadsService
        .recordQuotationSent(quotation.leadId, quotation.quotationNumber, actor.name)
        .catch((error) => this.logger.error('Lead Timeline entry for Send Quotation failed', error));
    }

    return { ...updated, salesOrder: null, emailStatus: result.status };
  }

  async getPdf(id: string): Promise<Buffer> {
    const quotation = await this.findOne(id);
    return this.quotationPdfService.render(quotation);
  }

  private sanitizeForFilename(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]+/g, '-');
  }

  getEmailHistory(id: string) {
    return this.prisma.emailHistory.findMany({
      where: { quotationId: id },
      orderBy: { sentAt: 'desc' },
    });
  }

  async remove(id: string, actorName?: string) {
    await this.findOne(id);
    const removed = await this.prisma.quotation.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.auditLogService
      .record({ module: 'Quotation', recordId: id, action: 'Deleted', actorName })
      .catch((error) => this.logger.error('AuditLog record failed', error));
    return removed;
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
    // installationCharge omitted entirely (undefined) means "auto-compute
    // from quantity"; explicitly passing a number (including 0) overrides
    // that. transportationCharge has no auto-compute — it just defaults to 0
    // when not supplied, since it varies by site/distance.
    installationCharge?: number,
    transportationCharge?: number,
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
    const totalQuantity = computedItems.reduce((sum, i) => sum + i.quantity, 0);
    const effectiveInstallationCharge =
      installationCharge ?? Math.round(INSTALLATION_RATE_PER_FAN * totalQuantity * 100) / 100;
    const effectiveTransportationCharge = transportationCharge ?? 0;
    const effectiveGstPercent = gstPercent ?? DEFAULT_GST_PERCENT;
    // GST is charged on the full pre-tax total — fans + installation +
    // transportation — matching standard invoicing practice, not just the
    // fan subtotal.
    const gstAmount =
      Math.round((subtotal + effectiveInstallationCharge + effectiveTransportationCharge) * (effectiveGstPercent / 100) * 100) /
      100;
    const grandTotal =
      Math.round((subtotal + effectiveInstallationCharge + effectiveTransportationCharge + gstAmount) * 100) / 100;

    return {
      items: computedItems,
      subtotal,
      gstPercent: effectiveGstPercent,
      installationCharge: effectiveInstallationCharge,
      transportationCharge: effectiveTransportationCharge,
      gstAmount,
      grandTotal,
    };
  }

  // regionCode (e.g. "NCR") is optional per quotation — some real orders
  // are tagged with a sales region/branch and some aren't, per the
  // customer's own reference documents ("SR|NCR|SPYRO|QTN|1043|2024-25" vs
  // "SR|SPYRO|QTN|1034|2025-26"). It changes the label, not the counter:
  // every "SR|...|QTN|<seq>|<year>" row — regardless of region code —
  // shares one running sequence, found by locating the "QTN" segment
  // rather than assuming a fixed prefix length. Scanning and parsing
  // numerically (not ORDER BY quotationNumber DESC) because string sort
  // would put "...|9|..." after "...|10|...". Old "QT-2026-000002" rows
  // don't start with "SR|" at all and are simply ignored — existing
  // numbers are never renumbered.
  private async generateQuotationNumber(regionCode?: string): Promise<string> {
    const year = new Date().getFullYear();
    const region = regionCode?.trim().toUpperCase();
    const rows = await this.prisma.quotation.findMany({
      where: { quotationNumber: { startsWith: 'SR|' } },
      select: { quotationNumber: true },
    });
    let maxSeq = 0;
    for (const row of rows) {
      const parts = row.quotationNumber.split('|');
      const qtnIndex = parts.indexOf('QTN');
      if (qtnIndex === -1 || qtnIndex + 1 >= parts.length) continue;
      const seq = parseInt(parts[qtnIndex + 1], 10);
      if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
    const nextSeq = maxSeq + 1;
    return region ? `SR|${region}|SPYRO|QTN|${nextSeq}|${year}` : `SR|SPYRO|QTN|${nextSeq}|${year}`;
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
