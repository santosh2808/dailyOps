import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SalesOrdersService } from '../sales-orders/sales-orders.service';
import { ProformaInvoicesService } from '../proforma-invoices/proforma-invoices.service';
import { JobExecutionOrdersService } from '../job-execution-orders/job-execution-orders.service';
import { ApprovalMatrixService } from '../approval-matrix/approval-matrix.service';
import { MailerService } from '../mailer/mailer.service';
import { QuotationPdfService, type QuotationPdfInput } from '../pdf/quotation-pdf.service';
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
import { AcceptPublicQuotationDto } from './dto/accept-public-quotation.dto';
import { RejectPublicQuotationDto } from './dto/reject-public-quotation.dto';

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
// Installation is Rs.8,000 per fan, auto-computed from the quantity of
// fan-type items only (products with a technical spec sheet) — spare parts
// like a standalone motor/drive don't carry this default, unless a quotation
// explicitly overrides installationCharge. Transportation has no equivalent
// rate — it varies by site/distance — so it's never auto-computed, only ever
// taken from what was supplied (defaulting to 0).
const INSTALLATION_RATE_PER_FAN = 8000;

// Customer Quotation Acceptance workflow — the secure public link is
// /quote/{publicToken} on the FRONTEND origin (not the API), so the
// customer lands on a page, not a raw JSON response. No hardcoded
// company-specific host per "no hardcoding" — configurable, defaults to
// the Vite dev server's own default port since that's what this project
// runs locally.
const DEFAULT_FRONTEND_URL = 'http://localhost:5173';
const DEFAULT_QUOTATION_LINK_EXPIRY_DAYS = 30;

function frontendBaseUrl(): string {
  return (process.env.FRONTEND_URL?.trim() || DEFAULT_FRONTEND_URL).replace(/\/+$/, '');
}

function quotationLinkExpiryDays(): number {
  const parsed = Number(process.env.QUOTATION_LINK_EXPIRY_DAYS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_QUOTATION_LINK_EXPIRY_DAYS;
}

// Sanitized shape returned by the public endpoints — deliberately hand-
// picked fields only (requirement #3/#11: never expose the quotation's own
// database id, salesperson internal notes, approval information, or
// internal pricing rules/margins).
export interface PublicQuotationView {
  quotationNumber: string;
  quotationDate: Date;
  validUntil: Date | null;
  customerName: string;
  customerCompany: string;
  items: {
    productName: string;
    description: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  subtotal: number;
  gstPercent: number;
  gstAmount: number;
  installationCharge: number;
  transportationCharge: number;
  grandTotal: number;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  notes: string | null;
  terms: string | null;
  status: string;
  acceptedAt: Date | null;
  acceptedByName: string | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
}

// Frozen offer content — everything about WHAT was offered (items, prices,
// terms, notes, valid-until), as opposed to the live decision state
// (status/acceptedAt/rejectedAt/etc, which always come from the Quotation
// row itself, never from here). Stored verbatim in Quotation.sentSnapshot
// the moment sendQuotation() actually sends an email, and read back by
// resolveOfferContent() below for both the public link's page and its PDF —
// so a customer always sees exactly what was emailed, never a live edit
// made afterward. Quotations sent before this field existed have no
// snapshot; resolveOfferContent() falls back to reconstructing this same
// shape from live data for those, matching this feature's pre-snapshot
// behavior exactly.
interface QuotationSentSnapshot {
  quotationNumber: string;
  createdAt: string;
  validUntil: string | null;
  customerName: string;
  customerCompany: string;
  // state: added for GST split (CGST+SGST vs IGST) on the Quotation PDF —
  // see QuotationPdfService.isIntraState(). Optional/nullable since older
  // snapshots (written before this field existed) won't have it.
  customer: { companyName?: string | null; contactPerson?: string | null; phone?: string | null; email?: string | null; state?: string | null } | null;
  lead: { companyName?: string | null; contactPerson?: string | null; phone?: string | null; email?: string | null; state?: string | null } | null;
  items: {
    productName: string;
    productDescription?: string | null;
    applicableTo?: string | null;
    technicalSpec?: unknown;
    description: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  subtotal: number;
  gstPercent: number;
  gstAmount: number;
  installationCharge: number;
  transportationCharge: number;
  grandTotal: number;
  notes: string | null;
  terms: string | null;
  commercialTerms: unknown;
}

// A handful of very lightweight, in-memory, per-process rate limits on the
// public accept/reject actions (requirement #11) — this backend has no
// Redis/rate-limiting package installed today (see MailerService's own
// "smallest appropriate mechanism" precedent for notifications), so this is
// the smallest addition that meaningfully slows down brute-forcing/spamming
// a single token without adding a new dependency or any shared state. Not a
// substitute for a real distributed limiter behind a load balancer with
// multiple instances — see the deliverable's Security/Limitations notes.
class SimpleRateLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  // Returns true if `key` is currently allowed to proceed (and records this
  // attempt); false if it's been called too many times within the window.
  check(key: string): boolean {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}

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

  // Requirement #11 — view/accept/reject are all cheap-to-call public
  // endpoints; keyed by publicToken (viewing/deciding) so this only ever
  // throttles repeated hits against one specific quotation's link, never
  // across the whole public quotation surface at once.
  private readonly viewRateLimiter = new SimpleRateLimiter(30, 60_000);
  private readonly decisionRateLimiter = new SimpleRateLimiter(10, 60_000);

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

    // Staff manually moving a quotation's status around (as opposed to the
    // customer deciding via the public link, or the ACCEPTED branch above)
    // must not leave stale, contradictory data behind. Two related risks:
    //
    // 1. Leaving a prior ACCEPTED/REJECTED decision's fields in place after
    //    moving to a different status — a quotation could otherwise end up
    //    simultaneously "accepted on 1st" and "rejected on 3rd" once staff
    //    later force it back to ACCEPTED/REJECTED again, or just carry
    //    stale rejectionReason text around forever.
    // 2. Leaving the OLD public link valid after this change — a customer
    //    who already decided (or whose link expired) could reopen that
    //    exact same link later and make a second, conflicting decision,
    //    since the token itself was never invalidated.
    //
    // Fix: whenever staff move a quotation to DRAFT/READY/EXPIRED, or move
    // it AWAY from ACCEPTED/REJECTED to anything else, clear any prior
    // decision fields and null out the public link entirely. Staff use
    // Send Quotation again afterward, which issues a fresh token and a
    // fresh sentSnapshot together — never a bare reactivation of the old
    // one.
    const linkInvalidatingTargets: string[] = ['DRAFT', 'READY', 'EXPIRED'];
    const leavingADecision =
      (existing.status === 'ACCEPTED' || existing.status === 'REJECTED') && dto.status !== existing.status;
    const shouldResetLink = linkInvalidatingTargets.includes(dto.status) || leavingADecision;

    const quotation = await this.prisma.quotation.update({
      where: { id },
      data: {
        status: dto.status,
        ...(shouldResetLink
          ? { publicToken: null, tokenExpiresAt: null }
          : {}),
        ...(leavingADecision
          ? {
              acceptedAt: null,
              acceptedByName: null,
              acceptedByDesignation: null,
              acceptanceComment: null,
              rejectedAt: null,
              rejectionReason: null,
              rejectionComment: null,
            }
          : {}),
      },
      include: QUOTATION_DETAIL_INCLUDE,
    });
    await this.auditLogService
      .record({
        module: 'Quotation',
        recordId: id,
        action: 'Status Changed',
        actorName: actor.name,
        oldValue: { status: existing.status },
        newValue: {
          status: dto.status,
          ...(shouldResetLink ? { publicLinkInvalidated: true } : {}),
          ...(leavingADecision ? { priorDecisionCleared: true } : {}),
        },
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

    // Freeze exactly what's being sent right now — resolveOfferContent()
    // falls back to reconstructing from live fields since this quotation
    // has no snapshot yet (or has a stale one from a prior send), so this
    // captures the same data the PDF above was just rendered from. Stored
    // below alongside the fresh token, so the public link and its PDF
    // always match this email, even if the quotation is edited afterward.
    const sentSnapshot = this.resolveOfferContent(quotation);

    // Customer Quotation Acceptance workflow (requirement #2) — a fresh
    // token every time this quotation is (re)sent, rather than reusing one
    // that already exists: resending implies a fresh 30-day (configurable)
    // window, and it means any previously-issued link for this quotation
    // stops working the moment a newer one goes out, which is the safer
    // default for a token that's meant to be single-purpose.
    const publicToken = crypto.randomBytes(32).toString('base64url');
    const tokenExpiresAt = new Date(Date.now() + quotationLinkExpiryDays() * 24 * 60 * 60 * 1000);
    const quotationLink = `${frontendBaseUrl()}/quote/${publicToken}`;

    const result = await this.mailerService.send({
      templateKey: 'QUOTATION',
      fallbackSubject: `Quotation {{quotationNumber}} - Smart Rotamac`,
      fallbackBodyHtml:
        '<p>Dear {{customerName}},</p>' +
        '<p>Thank you for your interest in Smart Rotamac.</p>' +
        '<p>Please find your quotation {{quotationNumber}}.</p>' +
        '<p>You can review the quotation using the link below.</p>' +
        '<p><a href="{{quotationLink}}">View Quotation</a></p>' +
        '<p>After reviewing the quotation, you can accept or reject it online.</p>' +
        '<p>Regards,<br/>{{salespersonName}}<br/>Smart Rotamac</p>',
      vars: {
        customerName: recipientName,
        quotationNumber: quotation.quotationNumber,
        grandTotal: quotation.grandTotal.toFixed(2),
        quotationLink,
        salespersonName: actor.name || 'Smart Rotamac Sales Team',
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
      data: {
        status: 'SENT',
        sentAt: new Date(),
        sentBy: actor.name,
        sentToEmail: to,
        publicToken,
        tokenExpiresAt,
        sentSnapshot: sentSnapshot as unknown as Prisma.InputJsonValue,
      },
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

  // Quotation History timeline (requirement #10) — internal, staff-facing
  // (gated by Quotation:View in the controller, unlike the Administrator-
  // only /api/v1/audit-log). Reuses the existing generic AuditLog table
  // rather than a new dedicated table, per "Do NOT create duplicate/
  // conflicting status systems" — this is exactly the module='Quotation'
  // slice of it, oldest first to read top-to-bottom like the spec's own
  // example.
  getHistory(id: string) {
    return this.prisma.auditLog.findMany({
      where: { module: 'Quotation', recordId: id },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ===========================================================================
  // Customer Quotation Acceptance workflow — secure public link.
  // Everything below is reachable from PublicQuotationsController, which has
  // no auth guard at all (this is a customer-facing, unauthenticated
  // surface by design — requirement: "Do NOT require the customer to have a
  // DailyOps account"). Every method here re-validates the token/expiry
  // itself rather than trusting anything about how it was reached.
  // ===========================================================================

  private async findByPublicToken(token: string) {
    // A malformed/unknown token gets exactly the same NotFoundException as
    // a well-formed-but-nonexistent one (requirement #11: "Prevent token
    // enumeration") — no distinction in the response that would help an
    // attacker learn anything about which tokens are real. A soft-deleted
    // quotation's token is treated exactly the same way — once staff have
    // deleted a quotation, its public link stops working entirely (no page,
    // no PDF, no accept/reject), same as if the token never existed.
    const quotation = await this.prisma.quotation.findUnique({
      where: { publicToken: token },
      include: QUOTATION_DETAIL_INCLUDE,
    });
    if (!quotation || quotation.deletedAt) {
      throw new NotFoundException('This quotation link is invalid.');
    }
    return quotation;
  }

  // True once either the link's own expiry (tokenExpiresAt) or the offer's
  // own validity date (validUntil — the date shown to the customer as
  // "Valid Until") has passed. Previously only tokenExpiresAt was checked,
  // which let a link stay "acceptable" well past the offer's stated
  // validity as long as the (much longer, configurable) link-expiry window
  // hadn't elapsed yet.
  private isPastValidity(quotation: { tokenExpiresAt: Date | null; validUntil: Date | null }): boolean {
    const now = Date.now();
    if (quotation.tokenExpiresAt && quotation.tokenExpiresAt.getTime() < now) return true;
    if (quotation.validUntil && quotation.validUntil.getTime() < now) return true;
    return false;
  }

  // Auto-expires a SENT/VIEWED quotation whose link or offer validity has
  // now passed, persisting the status change so the sales-side Quotation
  // Details page reflects reality too — not just a check made in passing on
  // the public side. Every public endpoint below calls this immediately
  // after resolving the token, before deciding whether a decision/PDF/view
  // is still allowed.
  private async autoExpireIfNeeded(
    quotation: Prisma.QuotationGetPayload<{ include: typeof QUOTATION_DETAIL_INCLUDE }>,
  ): Promise<Prisma.QuotationGetPayload<{ include: typeof QUOTATION_DETAIL_INCLUDE }>> {
    if ((quotation.status === 'SENT' || quotation.status === 'VIEWED') && this.isPastValidity(quotation)) {
      return this.prisma.quotation.update({
        where: { id: quotation.id },
        data: { status: 'EXPIRED' },
        include: QUOTATION_DETAIL_INCLUDE,
      });
    }
    return quotation;
  }

  // Only a still-open offer (SENT or VIEWED) can be accepted/rejected —
  // called by both acceptViaPublicLink() and rejectViaPublicLink() right
  // after autoExpireIfNeeded(), so an EXPIRED offer is refused with its own
  // clear message rather than the generic "already decided" one, and
  // (defensively — shouldn't be reachable once a decided/expired
  // quotation's link is invalidated by updateStatus(), but this is the
  // last line of defense) any other status is refused too.
  private assertDecidable(
    quotation: Prisma.QuotationGetPayload<{ include: typeof QUOTATION_DETAIL_INCLUDE }>,
  ): void {
    if (quotation.status === 'SENT' || quotation.status === 'VIEWED') return;
    if (quotation.status === 'EXPIRED') {
      throw new BadRequestException('This quotation link has expired.');
    }
    if (quotation.status === 'ACCEPTED' || quotation.status === 'REJECTED') {
      throw new ConflictException(`This quotation has already been ${quotation.status.toLowerCase()}.`);
    }
    throw new ConflictException('This quotation is not currently available for review.');
  }

  // Offer content (what was quoted) as opposed to decision state (whether
  // it's been accepted/rejected, which always comes straight off the live
  // Quotation row — see toPublicView() below). Prefers the frozen
  // Quotation.sentSnapshot written by sendQuotation(); falls back to
  // reconstructing the identical shape from live fields for a quotation
  // sent before this field existed, so nothing breaks for older records —
  // it just behaves like it did before snapshots existed (live-editable).
  private resolveOfferContent(
    quotation: Prisma.QuotationGetPayload<{ include: typeof QUOTATION_DETAIL_INCLUDE }>,
  ): QuotationSentSnapshot {
    const snapshot = quotation.sentSnapshot as unknown as QuotationSentSnapshot | null;
    if (snapshot) return snapshot;

    return {
      quotationNumber: quotation.quotationNumber,
      createdAt: quotation.createdAt.toISOString(),
      validUntil: quotation.validUntil ? quotation.validUntil.toISOString() : null,
      customerName: quotation.customer?.contactPerson ?? quotation.lead?.contactPerson ?? 'Customer',
      customerCompany: quotation.customer?.companyName ?? quotation.lead?.companyName ?? '',
      customer: quotation.customer
        ? {
            companyName: quotation.customer.companyName,
            contactPerson: quotation.customer.contactPerson,
            phone: quotation.customer.phone,
            email: quotation.customer.email,
            state: quotation.customer.state,
          }
        : null,
      lead: quotation.lead
        ? {
            companyName: quotation.lead.companyName,
            contactPerson: quotation.lead.contactPerson,
            phone: quotation.lead.phone,
            email: quotation.lead.email,
            state: quotation.lead.state,
          }
        : null,
      items: quotation.items.map((item) => ({
        productName: item.product?.name ?? 'Product',
        productDescription: item.product?.description ?? null,
        applicableTo: item.product?.applicableTo ?? null,
        technicalSpec: item.product?.technicalSpec ?? null,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
      })),
      subtotal: quotation.subtotal,
      gstPercent: quotation.gstPercent,
      gstAmount: quotation.gstAmount,
      installationCharge: quotation.installationCharge,
      transportationCharge: quotation.transportationCharge,
      grandTotal: quotation.grandTotal,
      notes: quotation.notes,
      terms: quotation.terms,
      commercialTerms: quotation.commercialTerms,
    };
  }

  // Converts frozen (or live-fallback) offer content into the shape
  // QuotationPdfService.render() needs — used by getPublicPdf() so the
  // link's "View/Download PDF" always matches the PDF that was actually
  // emailed, never a live-edited version.
  private toPdfInput(content: QuotationSentSnapshot): QuotationPdfInput {
    return {
      quotationNumber: content.quotationNumber,
      createdAt: new Date(content.createdAt),
      gstPercent: content.gstPercent,
      gstAmount: content.gstAmount,
      subtotal: content.subtotal,
      installationCharge: content.installationCharge,
      transportationCharge: content.transportationCharge,
      grandTotal: content.grandTotal,
      notes: content.notes,
      commercialTerms: content.commercialTerms,
      customer: content.customer,
      lead: content.lead,
      items: content.items.map((item) => ({
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        description: item.description,
        product: {
          name: item.productName,
          description: item.productDescription,
          applicableTo: item.applicableTo,
          technicalSpec: item.technicalSpec,
        },
      })),
    };
  }

  private toPublicView(
    quotation: Prisma.QuotationGetPayload<{ include: typeof QUOTATION_DETAIL_INCLUDE }>,
  ): PublicQuotationView {
    const content = this.resolveOfferContent(quotation);
    return {
      quotationNumber: content.quotationNumber,
      quotationDate: new Date(content.createdAt),
      validUntil: content.validUntil ? new Date(content.validUntil) : null,
      customerName: content.customerName,
      customerCompany: content.customerCompany,
      items: content.items.map((item) => ({
        productName: item.productName,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
      })),
      subtotal: content.subtotal,
      gstPercent: content.gstPercent,
      gstAmount: content.gstAmount,
      installationCharge: content.installationCharge,
      transportationCharge: content.transportationCharge,
      grandTotal: content.grandTotal,
      paymentTerms: (content.commercialTerms as Prisma.JsonObject | null)?.payment as string | null ?? null,
      deliveryTerms: (content.commercialTerms as Prisma.JsonObject | null)?.delivery as string | null ?? null,
      notes: content.notes,
      terms: content.terms,
      // Decision state is always live — never part of the frozen snapshot,
      // since accepting/rejecting is exactly the one thing that's allowed
      // to change after the offer itself was sent.
      status: quotation.status,
      acceptedAt: quotation.acceptedAt,
      acceptedByName: quotation.acceptedByName,
      rejectedAt: quotation.rejectedAt,
      rejectionReason: quotation.rejectionReason,
    };
  }

  // A comment/name field a customer typed is never HTML-rendered anywhere
  // in this app (React escapes text content by default, and the PDF/email
  // paths never interpolate it either), so the main risk is unbounded
  // length / control characters rather than script injection — trimmed and
  // length-capped here as the actual persisted value, on top of the DTO's
  // own @MaxLength.
  private sanitizeText(value: string | undefined, maxLength: number): string | undefined {
    if (!value) return undefined;
    // Strip control characters (keep normal whitespace) before trimming.
    const cleaned = value.split('').filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code !== 127;
    }).join('').trim();
    return cleaned ? cleaned.slice(0, maxLength) : undefined;
  }

  // GET /api/v1/public/quotations/:token (requirement #3/#7). Recording the
  // view is a deliberate side effect of this same read — every open of the
  // link is one "view" (requirement #7's "View Count" counts page loads,
  // not unique visitors/sessions; see the deliverable's Limitations note).
  // Never regresses an already-ACCEPTED/REJECTED quotation's status, and
  // never advances anything other than SENT -> VIEWED.
  async getPublicQuotation(
    token: string,
    clientKey: string,
  ): Promise<{ expired: true; quotationNumber: string } | { expired: false; quotation: PublicQuotationView }> {
    if (!this.viewRateLimiter.check(`view:${clientKey}`)) {
      throw new BadRequestException('Too many requests. Please try again in a moment.');
    }

    let quotation = await this.findByPublicToken(token);
    // Auto-expire on EITHER the link's own expiry OR the offer's stated
    // "Valid Until" date having passed — previously only the (much longer,
    // configurable) link expiry was checked here, which let a quotation
    // stay openly acceptable well past the date shown to the customer as
    // its own validity cutoff. Persisted so Quotation Details reflects it
    // too, not just this read.
    quotation = await this.autoExpireIfNeeded(quotation);

    if (quotation.status === 'EXPIRED') {
      return { expired: true, quotationNumber: quotation.quotationNumber };
    }

    const now = new Date();
    const isFirstView = !quotation.firstViewedAt;
    const updated = await this.prisma.quotation.update({
      where: { id: quotation.id },
      data: {
        firstViewedAt: quotation.firstViewedAt ?? now,
        lastViewedAt: now,
        viewCount: { increment: 1 },
        // SENT -> VIEWED exactly once — a quotation already VIEWED (or
        // further along) simply gets its view-tracking fields bumped above
        // without touching status again.
        ...(quotation.status === 'SENT' ? { status: 'VIEWED' as const } : {}),
      },
      include: QUOTATION_DETAIL_INCLUDE,
    });

    if (isFirstView || quotation.status === 'SENT') {
      await this.auditLogService
        .record({ module: 'Quotation', recordId: quotation.id, action: 'Customer Viewed Quotation' })
        .catch((error) => this.logger.error('AuditLog record failed', error));
    }

    return { expired: false, quotation: this.toPublicView(updated) };
  }

  // GET /api/v1/public/quotations/:token/pdf (requirement #3's "View/
  // Download PDF" button) — the existing /api/v1/quotations/:id/pdf route
  // requires a JWT, which an anonymous customer will never have, so this is
  // a second, token-authenticated entry point onto the exact same
  // QuotationPdfService.render() used everywhere else in the app (no PDF
  // template duplication). Shares the view rate limiter; deliberately does
  // NOT bump viewCount/firstViewedAt/lastViewedAt itself since the
  // customer's page load already counted the view via getPublicQuotation()
  // above by the time this is ever called.
  async getPublicPdf(token: string, clientKey: string): Promise<Buffer> {
    if (!this.viewRateLimiter.check(`view:${clientKey}`)) {
      throw new BadRequestException('Too many requests. Please try again in a moment.');
    }
    let quotation = await this.findByPublicToken(token);
    quotation = await this.autoExpireIfNeeded(quotation);
    if (quotation.status === 'EXPIRED') {
      throw new BadRequestException('This quotation link has expired.');
    }
    // Rendered from the frozen offer snapshot (or its live-fallback for a
    // pre-snapshot quotation), never live fields directly — this is what
    // guarantees the link's PDF always matches the one actually emailed.
    return this.quotationPdfService.render(this.toPdfInput(this.resolveOfferContent(quotation)));
  }

  // POST /api/v1/public/quotations/:token/accept (requirement #4). Per the
  // Sales Automation phase boundary this feature intentionally keeps in
  // place: this NEVER triggers Sales Order/Proforma Invoice/JEO creation,
  // regardless of whether this quotation has a Customer yet — that cascade
  // stays exactly where it already lives (the internal Change Status ->
  // ACCEPTED flow, via performAccept()), reachable afterwards from the
  // existing "Create Sales Order" button on Quotation Details once
  // quotation.customerId is set. The immediate goal here is acceptance
  // tracking, not re-running that cascade from a second trigger.
  async acceptViaPublicLink(token: string, dto: AcceptPublicQuotationDto, clientKey: string) {
    if (!this.decisionRateLimiter.check(`decide:${clientKey}`)) {
      throw new BadRequestException('Too many requests. Please try again in a moment.');
    }

    let quotation = await this.findByPublicToken(token);
    quotation = await this.autoExpireIfNeeded(quotation);
    // Requirement #4.8/#11 — prevent duplicate acceptance, and prevent
    // "accepting" something already rejected (or vice versa, in
    // rejectViaPublicLink() below) from a stale open tab. Only a still-open
    // offer (SENT/VIEWED) is decidable — an explicit whitelist rather than
    // just "not already ACCEPTED/REJECTED", so an expired offer is refused
    // too, not just a second decision on one already decided.
    this.assertDecidable(quotation);

    const name = this.sanitizeText(dto.name, 150) ?? 'Customer';
    const designation = this.sanitizeText(dto.designation, 150);
    const comment = this.sanitizeText(dto.comment, 1000);
    const acceptedAt = new Date();

    const updated = await this.prisma.quotation.update({
      where: { id: quotation.id },
      data: {
        status: 'ACCEPTED',
        acceptedAt,
        acceptedByName: name,
        acceptedByDesignation: designation ?? null,
        acceptanceComment: comment ?? null,
      },
      include: QUOTATION_DETAIL_INCLUDE,
    });

    await this.auditLogService
      .record({
        module: 'Quotation',
        recordId: quotation.id,
        action: 'Accepted by Customer',
        actorName: 'Customer',
        newValue: { acceptedByName: name, acceptedByDesignation: designation, acceptanceComment: comment },
      })
      .catch((error) => this.logger.error('AuditLog record failed', error));

    if (quotation.leadId) {
      await this.leadsService
        .recordQuotationAccepted(quotation.leadId, quotation.quotationNumber, 'Customer')
        .catch((error) => this.logger.error('Lead Timeline entry for Quotation Accepted failed', error));
    }

    await this.notifyInternalOfDecision(updated, 'ACCEPTED');

    return {
      quotationNumber: updated.quotationNumber,
      companyName: updated.customer?.companyName ?? updated.lead?.companyName ?? '',
    };
  }

  // POST /api/v1/public/quotations/:token/reject (requirement #5). When the
  // quotation is lead-originated, advances the Lead to LOST — see
  // LeadsService.recordQuotationRejected().
  async rejectViaPublicLink(token: string, dto: RejectPublicQuotationDto, clientKey: string) {
    if (!this.decisionRateLimiter.check(`decide:${clientKey}`)) {
      throw new BadRequestException('Too many requests. Please try again in a moment.');
    }

    let quotation = await this.findByPublicToken(token);
    quotation = await this.autoExpireIfNeeded(quotation);
    this.assertDecidable(quotation);

    const comment = this.sanitizeText(dto.comment, 1000);
    const rejectedAt = new Date();

    const updated = await this.prisma.quotation.update({
      where: { id: quotation.id },
      data: {
        status: 'REJECTED',
        rejectedAt,
        rejectionReason: dto.reason,
        rejectionComment: comment ?? null,
      },
      include: QUOTATION_DETAIL_INCLUDE,
    });

    await this.auditLogService
      .record({
        module: 'Quotation',
        recordId: quotation.id,
        action: 'Rejected by Customer',
        actorName: 'Customer',
        newValue: { rejectionReason: dto.reason, rejectionComment: comment },
      })
      .catch((error) => this.logger.error('AuditLog record failed', error));

    if (quotation.leadId) {
      await this.leadsService
        .recordQuotationRejected(quotation.leadId, quotation.quotationNumber, dto.reason, 'Customer')
        .catch((error) => this.logger.error('Lead Timeline entry for Quotation Rejected failed', error));
    }

    await this.notifyInternalOfDecision(updated, 'REJECTED');

    return {
      quotationNumber: updated.quotationNumber,
      companyName: updated.customer?.companyName ?? updated.lead?.companyName ?? '',
    };
  }

  // Sales team notification (requirement #8) — reuses the existing
  // Mailer/EmailTemplate/EmailHistory architecture exactly like every other
  // email in this system, rather than introducing a separate in-app
  // notification mechanism (none exists here today). Recipient resolution:
  // prefer the Lead's own assigned salesperson (a real User with an email
  // on file); otherwise fall back to looking up a User whose name matches
  // whoever sent the quotation (quotation.sentBy is a plain display-name
  // scalar, not a FK — same "no cross-module FK to Users" convention as
  // SalesOrder.createdBy/Lead.assignedTo's own schema comments). If neither
  // resolves to an email, MailerService.send() already handles a missing
  // recipient gracefully (status FAILED, visible in Email History) rather
  // than throwing — this never blocks the customer's Accept/Reject action.
  private async notifyInternalOfDecision(
    quotation: Prisma.QuotationGetPayload<{ include: typeof QUOTATION_DETAIL_INCLUDE }>,
    decision: 'ACCEPTED' | 'REJECTED',
  ) {
    let recipientEmail: string | undefined;
    if (quotation.lead?.assignedToUserId) {
      const assignee = await this.prisma.user.findUnique({ where: { id: quotation.lead.assignedToUserId } });
      recipientEmail = assignee?.email ?? undefined;
    }
    if (!recipientEmail && quotation.sentBy) {
      const sender = await this.prisma.user.findFirst({ where: { name: quotation.sentBy } });
      recipientEmail = sender?.email ?? undefined;
    }

    const companyName = quotation.customer?.companyName ?? quotation.lead?.companyName ?? 'the customer';

    await this.mailerService
      .send({
        templateKey: decision === 'ACCEPTED' ? 'QUOTATION_ACCEPTED_INTERNAL' : 'QUOTATION_REJECTED_INTERNAL',
        fallbackSubject:
          decision === 'ACCEPTED'
            ? `Quotation ${quotation.quotationNumber} has been accepted`
            : `Quotation ${quotation.quotationNumber} has been rejected`,
        fallbackBodyHtml:
          decision === 'ACCEPTED'
            ? `<p>Quotation {{quotationNumber}} has been accepted by {{customerCompany}}.</p><p>Accepted by: {{acceptedByName}}</p>`
            : `<p>Quotation {{quotationNumber}} has been rejected by {{customerCompany}}.</p><p>Reason: {{rejectionReason}}</p>`,
        vars: {
          quotationNumber: quotation.quotationNumber,
          customerCompany: companyName,
          acceptedByName: quotation.acceptedByName ?? '',
          rejectionReason: quotation.rejectionReason ?? '',
        },
        to: recipientEmail,
        link: { module: 'Quotation', quotationId: quotation.id },
      })
      .catch((error) => this.logger.error('Internal notification email failed', error));
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
    // Only fan-type items (products with an Annexure-I technical spec sheet
    // filled in) count toward the auto-computed installation charge —
    // spare parts sold alone (a replacement motor/drive) don't need fan
    // erection labour, so they default to Rs.0 installation here. Staff can
    // still type in a real installation/transportation figure per quotation
    // (e.g. for a paid out-of-warranty spare-part visit) exactly as they
    // already do for transportationCharge, which is never auto-computed.
    const fanQuantity = computedItems.reduce((sum, i) => {
      const spec = productMap.get(i.productId)?.technicalSpec as Record<string, unknown> | null;
      const isFan = !!spec && Object.keys(spec).length > 0;
      return isFan ? sum + i.quantity : sum;
    }, 0);
    const effectiveInstallationCharge =
      installationCharge ?? Math.round(INSTALLATION_RATE_PER_FAN * fanQuantity * 100) / 100;
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
