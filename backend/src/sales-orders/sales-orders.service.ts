import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SalesOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { UpdateSalesOrderDto } from './dto/update-sales-order.dto';
import { UpdateSalesOrderStatusDto } from './dto/update-sales-order-status.dto';
import { QuerySalesOrderDto } from './dto/query-sales-order.dto';
import { SalesOrderItemInputDto } from './dto/sales-order-item-input.dto';
import { DISPATCH_OVERRIDE_APPROVERS } from './dispatch-override-approvers';
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

const SALES_ORDER_DETAIL_INCLUDE = {
  customer: true,
  quotation: { select: { id: true, quotationNumber: true, status: true } },
  items: { include: { product: true } },
} satisfies Prisma.SalesOrderInclude;

const SALES_ORDER_LIST_INCLUDE = {
  customer: true,
  quotation: { select: { id: true, quotationNumber: true } },
  _count: { select: { items: true } },
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
    // Lead Management Phase 1 boundary (requirement #14): QuotationsService
    // now permits Quotation.customerId to be null (lead-sourced quotations),
    // but QuotationsService.updateStatus() already refuses to ever move such
    // a quotation to ACCEPTED — so in practice this can't be null here. This
    // check exists purely to satisfy TypeScript's narrowed `string | null`
    // type and as a defensive belt-and-suspenders guard, not because this
    // path is expected to be reachable.
    if (!quotation.customerId) {
      throw new BadRequestException('This Quotation has no Customer linked and cannot be converted to a Sales Order');
    }

    const existing = await this.prisma.salesOrder.findUnique({ where: { quotationId: dto.quotationId } });
    if (existing) {
      throw new ConflictException('A Sales Order has already been created from this Quotation');
    }

    const rawItems = this.resolveItemsAgainstQuotation(dto.items, quotation.items);
    const totals = this.computeTotals(rawItems, dto.gstPercent ?? DEFAULT_GST_PERCENT, dto.discount ?? 0);
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
            specialInstructions: dto.specialInstructions,
            remarks: dto.remarks,
            createdBy,
            subtotal: totals.subtotal,
            discount: totals.discount,
            tax: totals.tax,
            grandTotal: totals.grandTotal,
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
      const existingItemDiscountSum = existing.items.reduce((sum, i) => sum + i.discount, 0);
      const extraDiscount = dto.discount ?? Math.max(0, existing.discount - existingItemDiscountSum);

      if (dto.items) {
        const rawItems = this.resolveItemsAgainstQuotation(dto.items, quotation.items);
        const totals = this.computeTotals(rawItems, dto.gstPercent ?? DEFAULT_GST_PERCENT, extraDiscount);
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
        const totals = this.computeTotals(rawItems, dto.gstPercent!, extraDiscount);
        aggregate = totals;
        itemsToUpdateInPlace = totals.items;
      }
    } else if (dto.discount !== undefined) {
      // Only the order-level extra discount changed — item-level tax/line
      // totals (computed with whatever GST % was used previously) are left
      // untouched; only the order aggregate is recalculated.
      const subtotal = existing.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
      const itemDiscountSum = existing.items.reduce((sum, i) => sum + i.discount, 0);
      const tax = existing.items.reduce((sum, i) => sum + i.tax, 0);
      const totalDiscount = Math.round((itemDiscountSum + dto.discount) * 100) / 100;
      const grandTotal = Math.round((subtotal - totalDiscount + tax) * 100) / 100;
      aggregate = { subtotal: Math.round(subtotal * 100) / 100, discount: totalDiscount, tax, grandTotal };
    }

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
  private static readonly DISPATCH_ADVANCE_THRESHOLD_PERCENT = 50;

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
        existing.grandTotal > 0
          ? (existing.grandTotal * SalesOrdersService.DISPATCH_ADVANCE_THRESHOLD_PERCENT) / 100
          : 0;

      if (advanceReceived < requiredAdvance) {
        const approvedBy = dto.dispatchOverrideApprovedBy?.trim();
        if (!approvedBy) {
          throw new BadRequestException(
            `Advance payment received (₹${advanceReceived.toLocaleString('en-IN')}) is below the required ${SalesOrdersService.DISPATCH_ADVANCE_THRESHOLD_PERCENT}% of the order total (₹${requiredAdvance.toLocaleString('en-IN')}) — it cannot be marked Ready for Dispatch / Dispatched. Record more advance payment on the Proforma Invoice, or have Santosh Kumar Chegondi or Amarpal Gampa authorize a dispatch override.`,
          );
        }
        if (!(DISPATCH_OVERRIDE_APPROVERS as readonly string[]).includes(approvedBy)) {
          throw new BadRequestException(
            `"${approvedBy}" is not a recognized dispatch-override approver. Only Santosh Kumar Chegondi or Amarpal Gampa can authorize dispatching below the ${SalesOrdersService.DISPATCH_ADVANCE_THRESHOLD_PERCENT}% advance threshold.`,
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

  private computeTotals(items: RawItem[], gstPercent: number, extraDiscount: number): ComputedTotals {
    const computedItems: ComputedItem[] = items.map((item) => {
      const lineSubtotal = item.quantity * item.unitPrice;
      const taxable = Math.max(0, lineSubtotal - item.discount);
      const tax = Math.round(taxable * (gstPercent / 100) * 100) / 100;
      const lineTotal = Math.round((taxable + tax) * 100) / 100;
      return { ...item, tax, lineTotal };
    });

    const subtotal = Math.round(computedItems.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0) * 100) / 100;
    const itemDiscountSum = computedItems.reduce((sum, i) => sum + i.discount, 0);
    const discount = Math.round((itemDiscountSum + extraDiscount) * 100) / 100;
    const tax = Math.round(computedItems.reduce((sum, i) => sum + i.tax, 0) * 100) / 100;
    const grandTotal = Math.round((subtotal - discount + tax) * 100) / 100;

    return { items: computedItems, subtotal, discount, tax, grandTotal };
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
