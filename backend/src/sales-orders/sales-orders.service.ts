import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SalesOrderStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { extname, join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { mergeCc } from '../mailer/default-cc-emails';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { UpdateSalesOrderDto } from './dto/update-sales-order.dto';
import { UpdateSalesOrderStatusDto } from './dto/update-sales-order-status.dto';
import { SendSalesOrderDto } from './dto/send-sales-order.dto';
import { QuerySalesOrderDto } from './dto/query-sales-order.dto';
import { SalesOrderItemInputDto } from './dto/sales-order-item-input.dto';
import { DISPATCH_OVERRIDE_APPROVERS, MINIMUM_ADVANCE_PERCENT } from './dispatch-override-approvers';
import { assertForwardOnlyTransition } from '../common/status-transition.util';

// QA bug-fix pass (TC-080): the linear production sequence a Sales Order
// moves through. CANCELLED is a side-terminal reachable from any of these
// (an order can be cancelled at any pre-completion stage) but is not part
// of the forward sequence itself. COMPLETED is the one true end-of-sequence
// terminal — like CANCELLED, no further status change is allowed from it.
const SALES_ORDER_SEQUENCE: SalesOrderStatus[] = [
  'DRAFT',
  'CONFIRMED',
  'PRODUCTION_STARTED',
  'READY_FOR_DISPATCH',
  'DISPATCHED',
  'COMPLETED',
];

const SALES_ORDER_NUMBER_PREFIX = 'SO-';
const SALES_ORDER_NUMBER_PAD = 6;
const MAX_SALES_ORDER_NUMBER_ATTEMPTS = 5;
const DEFAULT_GST_PERCENT = 18;

// Customer PO document upload — see uploadCustomerPoDocument()'s comment.
// Same on-disk-file / DB-metadata-only convention as
// LeadsService.SITE_VISIT_PHOTOS_DIR.
const PO_DOCUMENT_DIR =
  process.env.SALES_ORDER_PO_DOCUMENTS_DIR?.trim() || join(process.cwd(), 'uploads', 'sales-order-po-documents');
const ALLOWED_PO_DOCUMENT_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const MAX_PO_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

// Passed by the controller from the JWT payload (req.user) — never trusted
// from the request body. `roles` drives the dispatch-override Administrator
// check below; `name` is the existing actor-display-name convention used
// everywhere else in this codebase. Same shape/convention as Quotations'
// QuotationActor.
export interface SalesOrderActor {
  name?: string;
  roles?: string[];
}

// See dispatch-override-approvers.ts for DISPATCH_OVERRIDE_APPROVERS
// (imported below) — split into its own file to avoid a circular import
// with UpdateSalesOrderStatusDto's @IsIn() validator.

// Whitelisted so `sortBy` from the query string can never be used to sort by
// an arbitrary/unindexed or sensitive column.
const SORTABLE_FIELDS = [
  'createdAt',
  'updatedAt',
  'salesOrderNumber',
  'grandTotal',
  'orderDate',
  'deliveryDate',
  'status',
] as const;

// Additive: JEO-based tracking — staff identify/search for Sales Orders by
// JEO number day-to-day (see ProformaInvoice.jeoId schema comment for the
// full rationale). Unlike the frozen-at-create jeoId on the two invoice
// models, a Sales Order's own jobExecutionOrders relation is a live list
// (a Sales Order can accumulate more than one JEO over its life), so this
// is read live here — "the latest one" is just the most recently created,
// any status — rather than stored as its own column.
const LATEST_JEO_INCLUDE = {
  jobExecutionOrders: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { id: true, jeoNumber: true } },
};

const SALES_ORDER_DETAIL_INCLUDE = {
  customer: true,
  quotation: { select: { id: true, quotationNumber: true, status: true } },
  items: { include: { product: true } },
  ...LATEST_JEO_INCLUDE,
} satisfies Prisma.SalesOrderInclude;

const SALES_ORDER_LIST_INCLUDE = {
  customer: true,
  quotation: { select: { id: true, quotationNumber: true } },
  _count: { select: { items: true } },
  ...LATEST_JEO_INCLUDE,
} satisfies Prisma.SalesOrderInclude;

interface RawItem {
  id?: string;
  productId: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  discount: number;
}

interface ComputedItem extends RawItem {
  tax: number;
  lineTotal: number;
}

interface ComputedTotals {
  items: ComputedItem[];
  subtotal: number;
  discount: number;
  tax: number;
  grandTotal: number;
  // QA bug fix ("Quotation -> Sales Order" charge breakdown FAIL): only
  // ever populated by freezeToQuotationTotalsIfUnmodified() below, from the
  // Quotation's own installationCharge/transportationCharge — computeTotals()
  // leaves these at 0 when items were edited from the quotation, matching
  // that function's existing, deliberate "don't guess how charges should
  // scale with a changed quantity" design (see the comment above
  // freezeToQuotationTotalsIfUnmodified).
  installationCharge: number;
  transportationCharge: number;
}

@Injectable()
export class SalesOrdersService {
  private readonly logger = new Logger(SalesOrdersService.name);

  constructor(
    private prisma: PrismaService,
    private mailerService: MailerService,
    private auditLogService: AuditLogService,
  ) {}

  async findAll(query: QuerySalesOrderDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();

    const where: Prisma.SalesOrderWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.quotationId ? { quotationId: query.quotationId } : {}),
      ...(query.customerState ? { customer: { state: query.customerState } } : {}),
      ...(query.createdBy ? { createdBy: query.createdBy } : {}),
      ...(query.productId ? { items: { some: { productId: query.productId } } } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            orderDate: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { salesOrderNumber: { contains: search, mode: 'insensitive' } },
              { quotation: { quotationNumber: { contains: search, mode: 'insensitive' } } },
              { customer: { companyName: { contains: search, mode: 'insensitive' } } },
              { customer: { contactPerson: { contains: search, mode: 'insensitive' } } },
              // Staff track Sales Orders day-to-day by JEO number — search
              // across every JEO ever linked (not just the latest), since
              // a match on an older, completed JEO is still a useful find.
              { jobExecutionOrders: { some: { jeoNumber: { contains: search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    const sortBy = SORTABLE_FIELDS.includes(query.sortBy as (typeof SORTABLE_FIELDS)[number])
      ? (query.sortBy as (typeof SORTABLE_FIELDS)[number])
      : 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

    const [data, total] = await Promise.all([
      this.prisma.salesOrder.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
        include: SALES_ORDER_LIST_INCLUDE,
      }),
      this.prisma.salesOrder.count({ where }),
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
    // Matches the Lead/Quotation convention: a direct lookup by id still
    // returns the record even if it has been soft-deleted; only the list
    // endpoint hides it by default.
    const salesOrder = await this.prisma.salesOrder.findUnique({
      where: { id },
      include: SALES_ORDER_DETAIL_INCLUDE,
    });
    if (!salesOrder) {
      throw new NotFoundException('Sales order not found');
    }
    return salesOrder;
  }

  async create(dto: CreateSalesOrderDto, createdBy?: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id: dto.quotationId },
      include: { items: { include: { product: true } } },
    });
    if (!quotation) {
      throw new NotFoundException('Quotation not found');
    }
    if (quotation.status !== 'ACCEPTED') {
      throw new BadRequestException('Sales Orders can only be created from an Accepted Quotation');
    }
    // A lead-sourced quotation (Quotation.customerId null) can now reach
    // ACCEPTED without ever having a Customer (see
    // QuotationsService.updateStatus()) — this is the actual, reachable
    // gate that requires one before a Sales Order can be created: staff run
    // "Convert to Customer" on the originating Lead first (which backfills
    // customerId onto the quotation), then this endpoint proceeds normally.
    if (!quotation.customerId) {
      throw new BadRequestException('This Quotation has no Customer linked and cannot be converted to a Sales Order');
    }

    const existing = await this.prisma.salesOrder.findUnique({ where: { quotationId: dto.quotationId } });
    if (existing) {
      throw new ConflictException('A Sales Order has already been created from this Quotation');
    }

    const rawItems = this.resolveItemsAgainstQuotation(dto.items, quotation.items);
    const totals = this.computeTotals(rawItems, dto.gstPercent ?? DEFAULT_GST_PERCENT);
    this.freezeToQuotationTotalsIfUnmodified(totals, rawItems, quotation);

    for (let attempt = 1; attempt <= MAX_SALES_ORDER_NUMBER_ATTEMPTS; attempt++) {
      const salesOrderNumber = await this.generateSalesOrderNumber();
      try {
        const created = await this.prisma.salesOrder.create({
          data: {
            salesOrderNumber,
            quotationId: quotation.id,
            // Customer information auto-populates from the Quotation — it is
            // never taken from the request body.
            customerId: quotation.customerId,
            orderDate: dto.orderDate ? new Date(dto.orderDate) : undefined,
            deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : undefined,
            paymentTerms: dto.paymentTerms,
            advancePercentage: dto.advancePercentage,
            billingAddress: dto.billingAddress,
            shippingAddress: dto.shippingAddress,
            customerPoNumber: dto.customerPoNumber,
            specialInstructions: dto.specialInstructions,
            remarks: dto.remarks,
            createdBy,
            subtotal: totals.subtotal,
            discount: totals.discount,
            tax: totals.tax,
            grandTotal: totals.grandTotal,
            installationCharge: totals.installationCharge,
            transportationCharge: totals.transportationCharge,
            items: { create: totals.items },
          },
          include: SALES_ORDER_DETAIL_INCLUDE,
        });

        await this.auditLogService
          .record({
            module: 'SalesOrder',
            recordId: created.id,
            action: 'Created',
            actorName: createdBy,
            newValue: { salesOrderNumber: created.salesOrderNumber, grandTotal: created.grandTotal },
          })
          .catch((error) => this.logger.error('AuditLog record failed', error));

        // "Order Confirmation" email (requirement #7's template list) — sent
        // on every Sales Order creation, manual or automatic (both paths
        // run through this one create() method), never a separate step the
        // user has to remember to trigger.
        await this.sendOrderConfirmationEmail(created, createdBy);

        return created;
      } catch (error) {
        if (this.isSalesOrderNumberConflict(error) && attempt < MAX_SALES_ORDER_NUMBER_ATTEMPTS) {
          continue; // Another request took this number first — retry with a fresh one.
        }
        throw error;
      }
    }

    // Unreachable, but keeps TypeScript satisfied about the return type.
    throw new Error('Failed to generate a unique sales order number');
  }

  private async sendOrderConfirmationEmail(
    salesOrder: Prisma.SalesOrderGetPayload<{ include: typeof SALES_ORDER_DETAIL_INCLUDE }>,
    actorName?: string,
  ) {
    try {
      await this.mailerService.send({
        templateKey: 'ORDER_CONFIRMATION',
        fallbackSubject: `Order Confirmation - ${salesOrder.salesOrderNumber}`,
        fallbackBodyHtml: `<p>Dear {{customerName}},</p><p>Your Sales Order {{salesOrderNumber}} (from Quotation {{quotationNumber}}) has been confirmed. Grand total: {{grandTotal}}.</p>`,
        vars: {
          customerName: salesOrder.customer.contactPerson,
          salesOrderNumber: salesOrder.salesOrderNumber,
          quotationNumber: salesOrder.quotation.quotationNumber,
          grandTotal: salesOrder.grandTotal.toFixed(2),
        },
        to: salesOrder.customer.email,
        actorName,
        link: { module: 'SalesOrder', salesOrderId: salesOrder.id },
      });
    } catch (error) {
      this.logger.error(`Order Confirmation email failed for Sales Order ${salesOrder.id}`, error);
    }
  }

  // Automatic Sales Order creation — triggered the moment a Quotation is
  // approved (status -> ACCEPTED), see QuotationsService.updateStatus().
  // Deliberately reuses create() above instead of duplicating any of its
  // logic, so both the manual POST /api/v1/sales-orders flow and this
  // automatic one run through the exact same code path: the
  // ACCEPTED-only guard, the one-Sales-Order-per-Quotation uniqueness
  // guard, salesOrderNumber generation/retry, and totals computation.
  // Idempotent by design: if a Sales Order already exists for this
  // quotation (this method is called again, or the quotation was already
  // ACCEPTED before this automation existed), the existing one is
  // returned instead of throwing — approving a quotation should never
  // surface a Sales-Order-conflict error to the approving user.
  async createFromQuotation(quotationId: string, createdBy?: string) {
    const existing = await this.prisma.salesOrder.findUnique({ where: { quotationId } });
    if (existing) {
      return this.findOne(existing.id);
    }

    const quotation = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: { items: true },
    });
    if (!quotation) {
      throw new NotFoundException('Quotation not found');
    }

    // Items are derived 1:1 from the Quotation's own items (same product +
    // quantity + description). unitPrice/discount are left undefined so
    // create()'s resolveItemsAgainstQuotation() falls back to the price
    // already recorded on the Quotation item — exactly what happens today
    // when a user creates a Sales Order manually without editing those
    // fields.
    const items: SalesOrderItemInputDto[] = quotation.items.map((item) => ({
      productId: item.productId,
      description: item.description ?? undefined,
      quantity: item.quantity,
    }));

    return this.create({ quotationId, items, gstPercent: quotation.gstPercent }, createdBy);
  }

  async update(id: string, dto: UpdateSalesOrderDto) {
    const existing = await this.findOne(id);
    // QA bug fix (SC-008 then SC-009): a Sales Order is only ever meant to
    // be edited while it's still a Draft — SC-008 first blocked just
    // CANCELLED, but QA correctly pointed out (SC-009) that the same
    // problem exists at every other status too: once confirmed, its items/
    // totals/addresses may already be reflected in a generated Proforma
    // Invoice, Tax Invoice, or JEO (or shown to the customer via "Send to
    // Customer"), so silently changing them out from under those documents
    // is exactly the bug this whole cluster of tickets is about. DRAFT is
    // the one status with nothing downstream depending on it yet, so it's
    // the only one still editable here. Status changes themselves still go
    // through updateStatus()/assertForwardOnlyTransition() below,
    // unaffected by this — only the ordinary "edit details" path is
    // blocked.
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException(
        `This Sales Order is ${existing.status === 'CANCELLED' ? 'cancelled' : 'no longer in Draft status'} and can no longer be edited.`,
      );
    }

    let aggregate: { subtotal: number; discount: number; tax: number; grandTotal: number } | null = null;
    // Only populated when the full item set is being replaced (dto.items
    // provided). When only gstPercent changes, existing items keep their
    // ids and are updated in place instead — see itemsToUpdateInPlace.
    let itemsToReplace: ComputedItem[] | null = null;
    let itemsToUpdateInPlace: ComputedItem[] | null = null;

    if (dto.items !== undefined || dto.gstPercent !== undefined) {
      // Items and/or GST changed — recompute every line from scratch. Items
      // must still belong to the sales order's originating quotation.
      const quotation = await this.prisma.quotation.findUnique({
        where: { id: existing.quotationId },
        include: { items: { include: { product: true } } },
      });
      if (!quotation) {
        throw new NotFoundException('The originating quotation for this sales order no longer exists');
      }
      if (dto.items) {
        const rawItems = this.resolveItemsAgainstQuotation(dto.items, quotation.items);
        const totals = this.computeTotals(rawItems, dto.gstPercent ?? DEFAULT_GST_PERCENT);
        aggregate = totals;
        itemsToReplace = totals.items;
      } else {
        // Same items, only GST % changed — keep ids stable and update each
        // item's tax/lineTotal in place rather than delete + recreate.
        const rawItems: RawItem[] = existing.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
        }));
        const totals = this.computeTotals(rawItems, dto.gstPercent!);
        aggregate = totals;
        itemsToUpdateInPlace = totals.items;
      }
    }
    // Note: there used to be a third branch here for when only the
    // order-level "Additional Discount" field changed (no items/GST edit).
    // That field has been removed entirely (see create-sales-order.dto.ts)
    // — discounting a Sales Order now only happens per line item, via
    // dto.items above, or implicitly by way of Quotation.discount already
    // baked into the frozen totals at creation.

    return this.prisma.$transaction(async (tx) => {
      if (itemsToReplace) {
        await tx.salesOrderItem.deleteMany({ where: { salesOrderId: id } });
      }
      if (itemsToUpdateInPlace) {
        for (const item of itemsToUpdateInPlace) {
          await tx.salesOrderItem.update({
            where: { id: item.id },
            data: { tax: item.tax, lineTotal: item.lineTotal },
          });
        }
      }

      return tx.salesOrder.update({
        where: { id },
        data: {
          orderDate: dto.orderDate ? new Date(dto.orderDate) : undefined,
          deliveryDate:
            dto.deliveryDate !== undefined ? (dto.deliveryDate ? new Date(dto.deliveryDate) : null) : undefined,
          paymentTerms: dto.paymentTerms,
          advancePercentage: dto.advancePercentage,
          billingAddress: dto.billingAddress,
          shippingAddress: dto.shippingAddress,
          customerPoNumber: dto.customerPoNumber,
          specialInstructions: dto.specialInstructions,
          remarks: dto.remarks,
          ...(aggregate
            ? {
                subtotal: aggregate.subtotal,
                discount: aggregate.discount,
                tax: aggregate.tax,
                grandTotal: aggregate.grandTotal,
              }
            : {}),
          ...(itemsToReplace ? { items: { create: itemsToReplace } } : {}),
        },
        include: SALES_ORDER_DETAIL_INCLUDE,
      });
    });
  }

  // QA bug fix (SC-007): "Updated Sales Order not sent to customer after
  // editing" — update() above recomputes items/totals and saves them, but
  // never emails anyone; the only automatic Sales Order email is
  // sendOrderConfirmationEmail(), fired once, at create() time. So editing
  // an order (product/quantity/price/discount) was completely silent to
  // the customer, with no in-app way to notify them even manually. This
  // gives staff that explicit action — mirrors
  // ProformaInvoicesService.sendInvoice(): lets the sender override the
  // recipient/CC for this send only, and (unlike the create()-time
  // best-effort auto-send, which swallows failures) propagates a failure
  // instead of swallowing it, since this is an explicit user action that
  // should surface a problem rather than hide it.
  async sendSalesOrder(id: string, dto: SendSalesOrderDto, actorName?: string) {
    const salesOrder = await this.findOne(id);
    if (salesOrder.status === 'CANCELLED') {
      throw new BadRequestException('A cancelled Sales Order cannot be sent to the customer.');
    }

    const to = dto.recipientEmail?.trim() || salesOrder.customer.email || undefined;
    const result = await this.mailerService.send({
      templateKey: 'SALES_ORDER_UPDATE',
      fallbackSubject: `Updated Sales Order - ${salesOrder.salesOrderNumber}`,
      fallbackBodyHtml:
        '<p>Dear {{customerName}},</p><p>Your Sales Order {{salesOrderNumber}} (from Quotation {{quotationNumber}}) has been updated. Grand total: {{grandTotal}}.</p><p>Please reach out if you have any questions about this update.</p>',
      vars: {
        customerName: salesOrder.customer.contactPerson,
        salesOrderNumber: salesOrder.salesOrderNumber,
        quotationNumber: salesOrder.quotation.quotationNumber,
        grandTotal: salesOrder.grandTotal.toFixed(2),
      },
      to,
      cc: mergeCc(dto.ccEmails),
      actorName,
      link: { module: 'SalesOrder', salesOrderId: id },
    });

    await this.auditLogService
      .record({
        module: 'SalesOrder',
        recordId: id,
        action: 'Sent Email',
        actorName,
        newValue: { to, emailStatus: result.status },
      })
      .catch((error) => this.logger.error('AuditLog record failed', error));

    return { ...salesOrder, emailStatus: result.status };
  }

  // Dispatch gate (advance-payment check): a Sales Order cannot move to
  // READY_FOR_DISPATCH or DISPATCHED unless at least 50% of the order's
  // grandTotal has been received as advance (via its Proforma Invoice's
  // advanceReceived — see ProformaInvoicesService.updateAdvance()).
  // Below that threshold, dispatch can still proceed, but only if BOTH:
  //   (a) the caller selects one of the two fixed DISPATCH_OVERRIDE_APPROVERS
  //       (Santosh Kumar Chegondi / Amarpal Gampa — either one is enough),
  //       recorded in dispatchOverrideApprovedBy; and
  //   (b) the acting user holds the Administrator role — the same
  //       `actor.roles.includes('Administrator')` idiom used by
  //       QuotationsService's approval-decision gate. A non-admin can never
  //       self-override, even if they happen to know one of the two names.
  private readonly DISPATCH_GATE_STATUSES: SalesOrderStatus[] = ['READY_FOR_DISPATCH', 'DISPATCHED'];
  // QA feature (SC-011): this used to be its own private constant here —
  // now shared with ProformaInvoicesService.updateAdvance()'s below-minimum
  // advance-payment gate via MINIMUM_ADVANCE_PERCENT (dispatch-override-approvers.ts),
  // so the two 50% thresholds can never drift apart from each other.

  async updateStatus(id: string, dto: UpdateSalesOrderStatusDto, actor: SalesOrderActor = {}) {
    const actorName = actor.name;
    const existing = await this.findOne(id);

    // QA bug-fix pass (TC-080): reject any transition that isn't a legal
    // one-stage-forward move (or a move into CANCELLED) BEFORE the
    // dispatch-advance-payment gate below runs, so an already-invalid
    // transition never even gets to that check.
    assertForwardOnlyTransition({
      current: existing.status,
      target: dto.status,
      order: SALES_ORDER_SEQUENCE,
      terminal: ['COMPLETED'],
      sideTerminal: ['CANCELLED'],
      entityLabel: 'Sales Order',
    });

    let dispatchOverrideNote: string | null = null;
    let dispatchOverrideBy: string | null = null;
    let dispatchOverrideApprovedBy: string | null = null;
    let dispatchOverrideAt: Date | null = null;

    if (this.DISPATCH_GATE_STATUSES.includes(dto.status)) {
      const activeInvoice = await this.prisma.proformaInvoice.findFirst({
        where: { salesOrderId: id, status: { not: 'CANCELLED' } },
        orderBy: { createdAt: 'desc' },
        select: { advanceReceived: true },
      });
      const advanceReceived = activeInvoice?.advanceReceived ?? 0;
      // grandTotal <= 0 is a degenerate order with nothing to collect
      // against — treat the threshold as already met rather than making it
      // impossible to ever satisfy.
      const requiredAdvance =
        existing.grandTotal > 0 ? (existing.grandTotal * MINIMUM_ADVANCE_PERCENT) / 100 : 0;

      if (advanceReceived < requiredAdvance) {
        const approvedBy = dto.dispatchOverrideApprovedBy?.trim();
        if (!approvedBy) {
          throw new BadRequestException(
            `Advance payment received (₹${advanceReceived.toLocaleString('en-IN')}) is below the required ${MINIMUM_ADVANCE_PERCENT}% of the order total (₹${requiredAdvance.toLocaleString('en-IN')}) — it cannot be marked Ready for Dispatch / Dispatched. Record more advance payment on the Proforma Invoice, or have Santosh Kumar Chegondi or Amarpal Gampa authorize a dispatch override.`,
          );
        }
        if (!(DISPATCH_OVERRIDE_APPROVERS as readonly string[]).includes(approvedBy)) {
          throw new BadRequestException(
            `"${approvedBy}" is not a recognized dispatch-override approver. Only Santosh Kumar Chegondi or Amarpal Gampa can authorize dispatching below the ${MINIMUM_ADVANCE_PERCENT}% advance threshold.`,
          );
        }
        if (!(actor.roles ?? []).includes('Administrator')) {
          throw new ForbiddenException(
            'Only an Administrator can record a dispatch override for advance payment below the required threshold.',
          );
        }
        dispatchOverrideNote = dto.dispatchOverrideNote?.trim() || null;
        dispatchOverrideApprovedBy = approvedBy;
        dispatchOverrideBy = actorName ?? null;
        dispatchOverrideAt = new Date();
      }
      // advanceReceived >= requiredAdvance: proceed normally, and clear out
      // any earlier override fields — they no longer reflect the current
      // situation.
    }

    const updated = await this.prisma.salesOrder.update({
      where: { id },
      data: {
        status: dto.status,
        ...(this.DISPATCH_GATE_STATUSES.includes(dto.status)
          ? { dispatchOverrideNote, dispatchOverrideBy, dispatchOverrideApprovedBy, dispatchOverrideAt }
          : {}),
      },
      include: SALES_ORDER_DETAIL_INCLUDE,
    });

    await this.auditLogService
      .record({
        module: 'SalesOrder',
        recordId: id,
        action: 'Status Changed',
        actorName,
        oldValue: { status: existing.status },
        newValue: { status: dto.status },
      })
      .catch((error) => this.logger.error('AuditLog record failed', error));

    // "Dispatch" email template (requirement #7's template list) — the one
    // trigger point for it in the current workflow, since dispatching is
    // exactly this status transition and nothing else in scope calls for a
    // separate "Send Dispatch Email" button.
    if (dto.status === 'DISPATCHED' && existing.status !== 'DISPATCHED') {
      try {
        await this.mailerService.send({
          templateKey: 'DISPATCH',
          fallbackSubject: `Your order ${updated.salesOrderNumber} has been dispatched`,
          fallbackBodyHtml: `<p>Dear {{customerName}},</p><p>Sales Order {{salesOrderNumber}} has been dispatched.</p>`,
          vars: { customerName: updated.customer.contactPerson, salesOrderNumber: updated.salesOrderNumber },
          to: updated.customer.email,
          actorName,
          link: { module: 'SalesOrder', salesOrderId: id },
        });
      } catch (error) {
        this.logger.error(`Dispatch email failed for Sales Order ${id}`, error);
      }
    }

    return updated;
  }

  async remove(id: string, actorName?: string) {
    await this.findOne(id);
    const removed = await this.prisma.salesOrder.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.auditLogService
      .record({ module: 'SalesOrder', recordId: id, action: 'Deleted', actorName })
      .catch((error) => this.logger.error('AuditLog record failed', error));
    return removed;
  }

  getEmailHistory(id: string) {
    return this.prisma.emailHistory.findMany({
      where: { salesOrderId: id },
      orderBy: { sentAt: 'desc' },
    });
  }

  // Optional scan/photo of the customer's actual Purchase Order — see
  // schema.prisma's comment on SalesOrder.customerPoDocument* for why this
  // is a separate action rather than part of create()/update(): those are
  // plain JSON endpoints, and forcing the whole order-creation flow to
  // multipart just for this one optional attachment isn't worth it.
  // customerPoNumber (the required field) stays in the regular DTO; this is
  // purely supporting evidence for it. Deliberately allowed at any status
  // except CANCELLED (unlike update(), which is DRAFT-only) — attaching the
  // customer's paperwork after production has already started is a normal,
  // harmless thing to do (e.g. the signed copy only arrives later), and
  // doesn't change any order economics the way editing items/addresses
  // would.
  async uploadCustomerPoDocument(id: string, file: Express.Multer.File | undefined, actorName?: string) {
    const existing = await this.findOne(id);
    if (existing.status === 'CANCELLED') {
      throw new BadRequestException('A cancelled Sales Order cannot have documents attached.');
    }
    if (!file) {
      throw new BadRequestException('No file uploaded. Attach a PDF, JPG or PNG of the Purchase Order.');
    }
    if (!ALLOWED_PO_DOCUMENT_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Purchase Order document must be a PDF, JPG or PNG file.');
    }
    if (file.size > MAX_PO_DOCUMENT_SIZE_BYTES) {
      throw new BadRequestException('Purchase Order document is larger than the 10MB limit.');
    }

    await fs.mkdir(PO_DOCUMENT_DIR, { recursive: true });

    // Generated filename — never derived from the browser-supplied
    // originalname, so nothing here is exposed to path traversal or
    // filename-collision issues. Same convention as
    // LeadsService.uploadSiteVisitPhotos().
    const ext = extname(file.originalname).slice(0, 10);
    const fileName = `${randomUUID()}${ext}`;
    await fs.writeFile(join(PO_DOCUMENT_DIR, fileName), file.buffer);

    // Replacing an existing document — remove the old on-disk file once the
    // new one is safely written and the DB row is about to be repointed.
    // Best-effort: a stray orphaned file left behind by a failed unlink is a
    // disk-cleanliness issue, not a correctness one (same reasoning as
    // LeadsService.deleteSiteVisitPhoto()).
    const previousFileName = existing.customerPoDocumentFileName;

    const updated = await this.prisma.salesOrder.update({
      where: { id },
      data: {
        customerPoDocumentFileName: fileName,
        customerPoDocumentOriginalName: file.originalname,
        customerPoDocumentMimeType: file.mimetype,
        customerPoDocumentSizeBytes: file.size,
        customerPoDocumentUploadedAt: new Date(),
        customerPoDocumentUploadedBy: actorName,
      },
      include: SALES_ORDER_DETAIL_INCLUDE,
    });

    if (previousFileName) {
      try {
        await fs.unlink(join(PO_DOCUMENT_DIR, previousFileName));
      } catch {
        // Ignore — see comment above.
      }
    }

    return updated;
  }

  async getCustomerPoDocumentFile(id: string) {
    const salesOrder = await this.findOne(id);
    if (!salesOrder.customerPoDocumentFileName) {
      throw new NotFoundException('No Purchase Order document has been uploaded for this Sales Order.');
    }
    const buffer = await fs.readFile(join(PO_DOCUMENT_DIR, salesOrder.customerPoDocumentFileName));
    return {
      buffer,
      mimeType: salesOrder.customerPoDocumentMimeType ?? 'application/octet-stream',
      originalName: salesOrder.customerPoDocumentOriginalName ?? 'purchase-order',
    };
  }

  async deleteCustomerPoDocument(id: string) {
    const salesOrder = await this.findOne(id);
    if (!salesOrder.customerPoDocumentFileName) {
      throw new NotFoundException('No Purchase Order document has been uploaded for this Sales Order.');
    }
    const fileName = salesOrder.customerPoDocumentFileName;
    const updated = await this.prisma.salesOrder.update({
      where: { id },
      data: {
        customerPoDocumentFileName: null,
        customerPoDocumentOriginalName: null,
        customerPoDocumentMimeType: null,
        customerPoDocumentSizeBytes: null,
        customerPoDocumentUploadedAt: null,
        customerPoDocumentUploadedBy: null,
      },
      include: SALES_ORDER_DETAIL_INCLUDE,
    });
    try {
      await fs.unlink(join(PO_DOCUMENT_DIR, fileName));
    } catch {
      // Ignore — see uploadCustomerPoDocument()'s comment.
    }
    return updated;
  }

  // Enforces "Quotation products must auto-populate": every submitted item
  // must reference a product already present on the linked quotation, and
  // unitPrice/description fall back to what the quotation recorded rather
  // than the (possibly since-changed) live product catalog price.
  private resolveItemsAgainstQuotation(
    items: SalesOrderItemInputDto[],
    quotationItems: { productId: string; description?: string | null; unitPrice: number; product: { name: string } }[],
  ): RawItem[] {
    const quotationItemMap = new Map(quotationItems.map((qi) => [qi.productId, qi]));

    return items.map((item) => {
      const quotationItem = quotationItemMap.get(item.productId);
      if (!quotationItem) {
        throw new BadRequestException(
          `Product ${item.productId} is not part of the originating quotation`,
        );
      }
      return {
        productId: item.productId,
        description: item.description ?? quotationItem.description ?? quotationItem.product.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice ?? quotationItem.unitPrice,
        discount: item.discount ?? 0,
      };
    });
  }

  // Bug fix (reported: "prices are getting varied in JEO grand total is
  // changing again from quotation"): computeTotals() above only ever
  // multiplies quantity x unitPrice and applies its own tax pass — it has
  // no notion of Quotation.installationCharge, Quotation.transportationCharge,
  // or a QuotationItem's colorCharge/hangingStructureCharge, and doesn't
  // understand the "prices already include GST" (pricesIncludeChargesAndGst)
  // branch at all. So any accepted Quotation that used any of those (which
  // is most real quotations — installationCharge alone auto-defaults to
  // Rs.8,000/fan) produced a Sales Order whose grandTotal silently differed
  // from the Quotation's — and since Proforma Invoice/Tax Invoice copy their
  // amounts from the Sales Order, and JEO's own "Grand Total" (shown on its
  // linked Sales Order) is read the same way, that wrong number is what
  // showed up everywhere downstream.
  //
  // Rather than reimplementing Quotation's whole charge/tax model a second,
  // divergent way here, when the Sales Order being created is an exact,
  // unmodified pass-through of the Quotation it's generated from (true for
  // every automatic Accept-cascade, and for a manual creation where staff
  // didn't touch quantity or add a discount — the Sales Order Items editor
  // doesn't even let unitPrice be edited, only quantity/discount), we freeze
  // the order-level totals to the Quotation's own already-computed
  // subtotal/gstAmount/grandTotal instead of recomputing them. Per-item
  // rows (SalesOrderItem.unitPrice/tax/lineTotal) are left as computeTotals()
  // produced them — still a plain qty x unitPrice breakdown for display —
  // so they may no longer sum to the new subtotal when the Quotation had
  // installation/transportation/color/hanging-structure charges; those
  // amounts are carried in the order-level total but aren't attributed to
  // any single line, the same way the Quotation PDF itself shows
  // installation/transportation as summary lines rather than per-item ones.
  //
  // When quantities were actually edited from what was quoted, we
  // deliberately do NOT freeze — how installationCharge/discount should
  // scale with a changed quantity is a business decision, not something to
  // guess here, so that case keeps using the recompute exactly as before
  // (unchanged, pre-existing behavior, not a regression).
  //
  // Bug fix (TC-049): freezing the order-level totals above was already
  // enough to fix the headline "Grand Total doesn't match" symptom, but
  // left each SalesOrderItem's own unitPrice/tax/lineTotal as a plain
  // qty x unitPrice computation — silently dropping the quotation item's
  // colorCharge/hangingStructureCharge from the per-item breakdown (they
  // were only ever reflected in the order-level aggregate, not attributed
  // to any line). Since QuotationItem.lineTotal is already stored as
  // qty x (unitPrice + colorCharge + hangingStructureCharge) — see
  // QuotationsService.computeTotals() — copying it straight across (and
  // backing out an equivalent per-unit price from it, quantity x
  // effectiveUnitPrice = lineTotal) carries the color/hanging-structure
  // charge forward exactly, without needing new schema columns. Per-item
  // `tax` is a proportional share of the frozen order-level GST (installation
  // /transportation charges still aren't attributed to a specific line —
  // same "summary line, not per-item" convention the Quotation PDF itself
  // uses for those two, see the comment above).
  private freezeToQuotationTotalsIfUnmodified(
    totals: ComputedTotals,
    rawItems: RawItem[],
    quotation: {
      subtotal: number;
      gstAmount: number;
      grandTotal: number;
      installationCharge: number;
      transportationCharge: number;
      items: { productId: string; quantity: number; lineTotal: number }[];
    },
  ): void {
    const matchesQuotationExactly =
      rawItems.length === quotation.items.length &&
      rawItems.every((item) => {
        const qi = quotation.items.find((q) => q.productId === item.productId);
        return !!qi && qi.quantity === item.quantity && item.discount === 0;
      }) &&
      totals.discount === 0;

    if (!matchesQuotationExactly) return;

    totals.subtotal = quotation.subtotal;
    totals.tax = quotation.gstAmount;
    // QA bug fix ("Quotation -> Sales Order" charge breakdown FAIL): these
    // charges were already reaching totals.grandTotal below (it's derived
    // from quotation.grandTotal, which itself includes them — see
    // QuotationsService.computeTotals()), but with no SalesOrder columns to
    // land in they were never stored anywhere of their own, so neither the
    // Sales Order creation preview nor SalesOrderDetails.tsx could show
    // them as separate line items — only the opaque combined total.
    totals.installationCharge = quotation.installationCharge;
    totals.transportationCharge = quotation.transportationCharge;
    // Bug fix: the Quotation itself no longer charges GST (it's quoted as
    // "Extra" — see QuotationsService.computeTotals(), which stopped
    // summing gstAmount into Quotation.grandTotal). GST is only actually
    // collected starting here, at Sales Order creation — so this freeze
    // must add gstAmount back on top of the Quotation's (GST-less)
    // grandTotal, not just copy it verbatim like before.
    totals.grandTotal = Math.round((quotation.grandTotal + quotation.gstAmount) * 100) / 100;

    const lineTotalSum = quotation.items.reduce((sum, qi) => sum + qi.lineTotal, 0);
    totals.items = totals.items.map((item) => {
      const qi = quotation.items.find((q) => q.productId === item.productId);
      if (!qi || item.quantity <= 0) return item;
      const effectiveUnitPrice = Math.round((qi.lineTotal / item.quantity) * 100) / 100;
      const tax =
        lineTotalSum > 0 ? Math.round(((qi.lineTotal / lineTotalSum) * quotation.gstAmount) * 100) / 100 : 0;
      return { ...item, unitPrice: effectiveUnitPrice, lineTotal: qi.lineTotal, tax };
    });
  }

  private computeTotals(items: RawItem[], gstPercent: number): ComputedTotals {
    const computedItems: ComputedItem[] = items.map((item) => {
      const lineSubtotal = item.quantity * item.unitPrice;
      const taxable = Math.max(0, lineSubtotal - item.discount);
      const tax = Math.round(taxable * (gstPercent / 100) * 100) / 100;
      const lineTotal = Math.round((taxable + tax) * 100) / 100;
      return { ...item, tax, lineTotal };
    });

    const subtotal = Math.round(computedItems.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0) * 100) / 100;
    const tax = Math.round(computedItems.reduce((sum, i) => sum + i.tax, 0) * 100) / 100;
    // Each line's own discount is clamped above (taxable can't go below 0
    // for that line), but the SUM of per-line discounts across the order
    // could still exceed subtotal+tax if entered generously enough on
    // several lines at once — clamp the aggregate too so grandTotal can
    // never go negative (QA SC-004: "discount greater than subtotal ...
    // total amount becomes negative").
    const itemDiscountSum = computedItems.reduce((sum, i) => sum + i.discount, 0);
    const discount = Math.round(Math.min(Math.max(0, itemDiscountSum), subtotal + tax) * 100) / 100;
    const grandTotal = Math.round((subtotal - discount + tax) * 100) / 100;

    return {
      items: computedItems,
      subtotal,
      discount,
      tax,
      grandTotal,
      installationCharge: 0,
      transportationCharge: 0,
    };
  }

  private async generateSalesOrderNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const yearPrefix = `${SALES_ORDER_NUMBER_PREFIX}${year}-`;
    const last = await this.prisma.salesOrder.findFirst({
      where: { salesOrderNumber: { startsWith: yearPrefix } },
      orderBy: { salesOrderNumber: 'desc' },
      select: { salesOrderNumber: true },
    });
    const lastSeq = last ? parseInt(last.salesOrderNumber.replace(yearPrefix, ''), 10) || 0 : 0;
    return `${yearPrefix}${String(lastSeq + 1).padStart(SALES_ORDER_NUMBER_PAD, '0')}`;
  }

  private isSalesOrderNumberConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      Array.isArray(error.meta?.target) &&
      (error.meta?.target as string[]).includes('salesOrderNumber')
    );
  }
}
