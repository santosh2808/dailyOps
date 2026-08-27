import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { JeoPdfService } from '../pdf/jeo-pdf.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateJeoDto } from './dto/create-jeo.dto';
import { UpdateJeoStatusDto } from './dto/update-jeo-status.dto';
import { UpdateProductionChecklistDto } from './dto/update-production-checklist.dto';
import { QueryJeoDto } from './dto/query-jeo.dto';

const JEO_NUMBER_PREFIX = 'JEO-';
const JEO_NUMBER_PAD = 6;
const MAX_JEO_NUMBER_ATTEMPTS = 5;

// Whitelisted so `sortBy` from the query string can never be used to sort by
// an arbitrary/unindexed or sensitive column.
const SORTABLE_FIELDS = [
  'createdAt',
  'updatedAt',
  'jeoNumber',
  'deliveryDate',
  'priority',
  'status',
] as const;

// No JobExecutionOrderItem table exists (see schema.prisma comment) — line
// items are read live through the linked Sales Order for display.
// `quotation.createdAt` is included (in addition to the id/number/status
// already needed elsewhere) specifically for the "Quotation Created" step
// on the Timeline (see getTimeline()).
const JEO_DETAIL_INCLUDE = {
  customer: true,
  quotation: { select: { id: true, quotationNumber: true, status: true, createdAt: true } },
  salesOrder: {
    include: { items: { include: { product: true } } },
  },
  checklist: true,
} satisfies Prisma.JobExecutionOrderInclude;

const JEO_LIST_INCLUDE = {
  customer: true,
  salesOrder: { select: { id: true, salesOrderNumber: true } },
  checklist: true,
} satisfies Prisma.JobExecutionOrderInclude;

// Products/quantity for the Production Dashboard table are read live via
// salesOrder.items, same as everywhere else this model is displayed.
const JEO_DASHBOARD_INCLUDE = {
  customer: true,
  salesOrder: {
    select: {
      id: true,
      salesOrderNumber: true,
      items: { include: { product: true } },
    },
  },
  checklist: true,
} satisfies Prisma.JobExecutionOrderInclude;

const JEO_STATUSES = [
  'PENDING',
  'MATERIAL_READY',
  'ASSEMBLY_STARTED',
  'QC',
  'READY_FOR_DISPATCH',
  'COMPLETED',
] as const;

// Production Dashboard response field name for each status — the dashboard
// contract uses flat camelCase keys (pending/materialReady/...) rather than
// the raw JeoStatus enum values, per scope.
const STATUS_TO_DASHBOARD_KEY = {
  PENDING: 'pending',
  MATERIAL_READY: 'materialReady',
  ASSEMBLY_STARTED: 'assemblyStarted',
  QC: 'qc',
  READY_FOR_DISPATCH: 'readyForDispatch',
  COMPLETED: 'completed',
} as const;

interface ProductionDashboardCounts {
  pending: number;
  materialReady: number;
  assemblyStarted: number;
  qc: number;
  readyForDispatch: number;
  completed: number;
}

const EMPTY_DASHBOARD_COUNTS: ProductionDashboardCounts = {
  pending: 0,
  materialReady: 0,
  assemblyStarted: 0,
  qc: 0,
  readyForDispatch: 0,
  completed: 0,
};

@Injectable()
export class JobExecutionOrdersService {
  private readonly logger = new Logger(JobExecutionOrdersService.name);

  constructor(
    private prisma: PrismaService,
    private mailerService: MailerService,
    private jeoPdfService: JeoPdfService,
    private auditLogService: AuditLogService,
  ) {}

  async findAll(query: QueryJeoDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();

    const where: Prisma.JobExecutionOrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.salesOrderId ? { salesOrderId: query.salesOrderId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            deliveryDate: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { jeoNumber: { contains: search, mode: 'insensitive' } },
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
      this.prisma.jobExecutionOrder.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
        include: JEO_LIST_INCLUDE,
      }),
      this.prisma.jobExecutionOrder.count({ where }),
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
    const jeo = await this.prisma.jobExecutionOrder.findUnique({
      where: { id },
      include: JEO_DETAIL_INCLUDE,
    });
    if (!jeo) {
      throw new NotFoundException('Job execution order not found');
    }
    return jeo;
  }

  async create(dto: CreateJeoDto, actorName?: string) {
    const salesOrder = await this.prisma.salesOrder.findUnique({ where: { id: dto.salesOrderId } });
    if (!salesOrder) {
      throw new NotFoundException('Sales order not found');
    }

    // Only one active (not yet COMPLETED) JEO may exist per Sales Order at a
    // time — JEO has no CANCELLED status (unlike ProformaInvoice), so
    // "active" here means anything short of COMPLETED.
    const existingActive = await this.prisma.jobExecutionOrder.findFirst({
      where: { salesOrderId: dto.salesOrderId, status: { not: 'COMPLETED' } },
    });
    if (existingActive) {
      throw new ConflictException(
        'An active Job Execution Order already exists for this Sales Order.',
      );
    }

    // Customer, Quotation reference, Sales Order reference, and Delivery
    // Date are all copied straight from the Sales Order — never re-entered
    // by hand. Products are not duplicated either; they're read live via
    // salesOrder.items (see schema.prisma comment). Only priority,
    // assignedTo, and remarks come from the request body.
    for (let attempt = 1; attempt <= MAX_JEO_NUMBER_ATTEMPTS; attempt++) {
      const jeoNumber = await this.generateJeoNumber();
      try {
        const created = await this.prisma.jobExecutionOrder.create({
          data: {
            jeoNumber,
            salesOrderId: salesOrder.id,
            customerId: salesOrder.customerId,
            quotationId: salesOrder.quotationId,
            deliveryDate: salesOrder.deliveryDate,
            priority: dto.priority,
            assignedTo: dto.assignedTo,
            remarks: dto.remarks,
            // Created together with its JEO, all steps unchecked — never
            // created standalone (see schema.prisma comment).
            checklist: { create: {} },
          },
          include: JEO_DETAIL_INCLUDE,
        });

        await this.auditLogService
          .record({ module: 'JEO', recordId: created.id, action: 'Generated', actorName })
          .catch((error) => this.logger.error('AuditLog record failed', error));

        // Requirement #13 / "Notify Factory": every JEO generation — manual
        // or automatic (both run through this one create() method) —
        // emails the Production Team with the JEO PDF attached.
        await this.sendFactoryNotificationEmail(created, actorName);

        return created;
      } catch (error) {
        if (this.isJeoNumberConflict(error) && attempt < MAX_JEO_NUMBER_ATTEMPTS) {
          continue; // Another request took this number first — retry with a fresh one.
        }
        throw error;
      }
    }

    // Unreachable, but keeps TypeScript satisfied about the return type.
    throw new Error('Failed to generate a unique JEO number');
  }

  // Automatic-cascade entry point (Sales Order -> automatically generate
  // JEO), invoked from QuotationsService.performAccept(). Idempotent: if
  // an active (not yet COMPLETED) JEO already exists for this Sales Order,
  // it's returned as-is rather than throwing create()'s
  // ConflictException — same pattern as
  // ProformaInvoicesService.createFromSalesOrder().
  async createFromSalesOrder(salesOrderId: string) {
    const existing = await this.prisma.jobExecutionOrder.findFirst({
      where: { salesOrderId, status: { not: 'COMPLETED' } },
    });
    if (existing) {
      return this.findOne(existing.id);
    }
    return this.create({ salesOrderId, priority: 'MEDIUM' });
  }

  async updateStatus(id: string, dto: UpdateJeoStatusDto, actorName?: string) {
    const existing = await this.findOne(id);
    const updated = await this.prisma.jobExecutionOrder.update({
      where: { id },
      data: {
        status: dto.status,
        // completedAt on the checklist is set here, when a supervisor
        // explicitly marks the JEO COMPLETED — not auto-inferred from the
        // checklist booleans, so the last checkbox never silently finishes
        // the job (see schema.prisma comment on ProductionChecklist).
        ...(dto.status === 'COMPLETED'
          ? { checklist: { update: { completedAt: new Date() } } }
          : {}),
      },
      include: JEO_DETAIL_INCLUDE,
    });
    await this.auditLogService
      .record({
        module: 'JEO',
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
      where: { jobExecutionOrderId: id },
      orderBy: { sentAt: 'desc' },
    });
  }

  // Branded PDF (replicates "JEO 5478.doc") — used both for the standalone
  // GET :id/pdf download and internally by sendFactoryNotificationEmail()'s
  // attachment, so the emailed copy and the on-demand download always match.
  async getPdf(id: string, actorName?: string): Promise<Buffer> {
    const jeo = await this.findOne(id);
    return this.jeoPdfService.render(this.toPdfInput(jeo, actorName));
  }

  private toPdfInput(
    jeo: Prisma.JobExecutionOrderGetPayload<{ include: typeof JEO_DETAIL_INCLUDE }>,
    generatedBy?: string,
  ) {
    return {
      jeoNumber: jeo.jeoNumber,
      createdAt: jeo.createdAt,
      deliveryDate: jeo.deliveryDate,
      priority: jeo.priority,
      customer: { companyName: jeo.customer.companyName, state: jeo.customer.state },
      billingAddress: jeo.salesOrder.billingAddress,
      shippingAddress: jeo.salesOrder.shippingAddress,
      remarks: jeo.remarks,
      items: jeo.salesOrder.items.map((item) => ({
        quantity: item.quantity,
        product: { name: item.product.name, technicalSpec: item.product.technicalSpec },
      })),
      generatedBy,
    };
  }

  private async sendFactoryNotificationEmail(
    jeo: Prisma.JobExecutionOrderGetPayload<{ include: typeof JEO_DETAIL_INCLUDE }>,
    actorName?: string,
  ) {
    try {
      const pdf = await this.jeoPdfService.render(this.toPdfInput(jeo, actorName));

      // "Notify Factory" — env-configurable Production Team recipient
      // (there's no per-user Production distribution list modeled yet), so
      // this is never a hardcoded address; unset simply skips the send
      // (logged as FAILED "no recipient" in EmailHistory, exactly like any
      // other missing-recipient case).
      await this.mailerService.send({
        templateKey: 'JEO_NOTIFICATION',
        fallbackSubject: `New Job Execution Order ${jeo.jeoNumber}`,
        fallbackBodyHtml: `<p>A new Job Execution Order {{jeoNumber}} has been generated for Sales Order {{salesOrderNumber}} (Customer: {{customerName}}). Priority: {{priority}}.</p>`,
        vars: {
          jeoNumber: jeo.jeoNumber,
          salesOrderNumber: jeo.salesOrder.salesOrderNumber,
          customerName: jeo.customer.companyName,
          priority: jeo.priority,
        },
        to: process.env.FACTORY_NOTIFICATION_EMAIL,
        attachments: [{ filename: `${jeo.jeoNumber}.pdf`, content: pdf }],
        actorName,
        link: { module: 'JEO', jobExecutionOrderId: jeo.id },
      });
    } catch (error) {
      this.logger.error(`Factory notification email failed for JEO ${jeo.id}`, error);
    }
  }

  // Production Dashboard: six status counts (across ALL JEOs, including
  // Completed ones — the cards need a total picture) plus the list of
  // active (not yet Completed) JEOs to show in the table, per scope.
  // Response shape is a flat object — { pending, materialReady,
  // assemblyStarted, qc, readyForDispatch, completed, activeOrders } — per
  // the exact contract required by the frontend/dashboard consumer.
  //
  // Built from six independent `count()` calls rather than a `groupBy()` —
  // every other read in this codebase only ever uses
  // findMany/count/findFirst/findUnique, and `groupBy()` was a one-off,
  // never-exercised-elsewhere Prisma call that previously caused this
  // endpoint to fail. `count({ where: { status } })` for a status with zero
  // matching rows simply resolves to 0 — there is no code path here that
  // can throw because the table (or a given status) is empty.
  async getProductionDashboard() {
    try {
      const countEntries = await Promise.all(
        JEO_STATUSES.map(
          async (status) =>
            [
              STATUS_TO_DASHBOARD_KEY[status],
              await this.prisma.jobExecutionOrder.count({ where: { status } }),
            ] as const,
        ),
      );
      const counts = Object.fromEntries(countEntries) as unknown as ProductionDashboardCounts;

      // "Active" here matches the same definition used for duplicate
      // prevention in create() — anything short of COMPLETED. findMany()
      // naturally resolves to [] when nothing matches, so an empty table
      // just renders an empty table client-side — never an error.
      const activeOrders = await this.prisma.jobExecutionOrder.findMany({
        where: { status: { not: 'COMPLETED' } },
        orderBy: { deliveryDate: 'asc' },
        include: JEO_DASHBOARD_INCLUDE,
      });

      return { ...counts, activeOrders };
    } catch (error) {
      // Belt-and-braces per scope ("do not throw errors when the database
      // is empty"): even if something unexpected goes wrong here, fail soft
      // into the same zero/empty shape instead of a 500.
      console.error('getProductionDashboard failed, returning empty dashboard', error);
      return { ...EMPTY_DASHBOARD_COUNTS, activeOrders: [] };
    }
  }

  // Best-effort cross-module lifecycle timeline for a single JEO, built
  // from records that already exist elsewhere in the schema — no new
  // tracking table or columns were added for this (per "use existing JEO
  // records"). Two real limitations, both documented here rather than
  // silently glossed over:
  //   1. There is no FK from Quotation back to the Lead that produced its
  //      Customer, so "Lead Created" is a best-effort join on
  //      `customerId` (the earliest Lead ever converted into this
  //      customer) — if the customer was created directly (not via lead
  //      conversion), this step is simply omitted rather than guessed at.
  //   2. Production Started / QC / Dispatch have no stored per-transition
  //      timestamp (JobExecutionOrder has a single mutable `status` column,
  //      not a history log) — these are marked done/not-done from the
  //      current status and checklist flags, and only get a timestamp when
  //      they represent the JEO's *current* status (using `updatedAt` as an
  //      approximation), since we cannot know exactly when an earlier
  //      transition happened. Completed is the exception: its timestamp
  //      comes from the real `completedAt` column on ProductionChecklist.
  async getTimeline(id: string) {
    const jeo = await this.findOne(id);

    const [lead, proformaInvoice] = await Promise.all([
      this.prisma.lead.findFirst({
        where: { customerId: jeo.customerId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.proformaInvoice.findFirst({
        where: { salesOrderId: jeo.salesOrderId },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const checklist = jeo.checklist;
    const status = jeo.status;
    const productionStarted =
      ['ASSEMBLY_STARTED', 'QC', 'READY_FOR_DISPATCH', 'COMPLETED'].includes(status) ||
      !!checklist?.assemblyStarted;
    const qcDone =
      ['QC', 'READY_FOR_DISPATCH', 'COMPLETED'].includes(status) || !!checklist?.qcPassed;
    // "Dispatch" maps to READY_FOR_DISPATCH — JeoStatus has no separate
    // DISPATCHED value (unlike SalesOrderStatus), so this is the closest
    // real milestone to the "Dispatch" step named in scope.
    const dispatchDone =
      ['READY_FOR_DISPATCH', 'COMPLETED'].includes(status) || !!checklist?.readyForDispatch;
    const completedDone = status === 'COMPLETED';

    return {
      steps: [
        { key: 'leadCreated', label: 'Lead Created', done: !!lead, at: lead?.createdAt ?? null },
        { key: 'customerCreated', label: 'Customer Created', done: true, at: jeo.customer.createdAt },
        { key: 'quotationCreated', label: 'Quotation Created', done: true, at: jeo.quotation.createdAt },
        { key: 'salesOrderCreated', label: 'Sales Order Created', done: true, at: jeo.salesOrder.createdAt },
        {
          key: 'proformaInvoiceGenerated',
          label: 'Proforma Invoice Generated',
          done: !!proformaInvoice,
          at: proformaInvoice?.createdAt ?? null,
        },
        { key: 'jeoGenerated', label: 'JEO Generated', done: true, at: jeo.createdAt },
        {
          key: 'productionStarted',
          label: 'Production Started',
          done: productionStarted,
          at: productionStarted && status === 'ASSEMBLY_STARTED' ? jeo.updatedAt : null,
        },
        {
          key: 'qc',
          label: 'QC',
          done: qcDone,
          at: qcDone && status === 'QC' ? jeo.updatedAt : null,
        },
        {
          key: 'dispatch',
          label: 'Dispatch',
          done: dispatchDone,
          at: dispatchDone && status === 'READY_FOR_DISPATCH' ? jeo.updatedAt : null,
        },
        { key: 'completed', label: 'Completed', done: completedDone, at: checklist?.completedAt ?? null },
      ],
    };
  }

  async updateChecklist(id: string, dto: UpdateProductionChecklistDto) {
    const jeo = await this.findOne(id);
    if (!jeo.checklist) {
      // Should never happen — a checklist is always created alongside its
      // JEO — but guards against a corrupted/partial row.
      throw new NotFoundException('Production checklist not found for this JEO');
    }
    await this.prisma.productionChecklist.update({
      where: { jeoId: id },
      data: { ...dto },
    });
    return this.findOne(id);
  }

  private async generateJeoNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const yearPrefix = `${JEO_NUMBER_PREFIX}${year}-`;
    const last = await this.prisma.jobExecutionOrder.findFirst({
      where: { jeoNumber: { startsWith: yearPrefix } },
      orderBy: { jeoNumber: 'desc' },
      select: { jeoNumber: true },
    });
    const lastSeq = last ? parseInt(last.jeoNumber.replace(yearPrefix, ''), 10) || 0 : 0;
    return `${yearPrefix}${String(lastSeq + 1).padStart(JEO_NUMBER_PAD, '0')}`;
  }

  private isJeoNumberConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      Array.isArray(error.meta?.target) &&
      (error.meta?.target as string[]).includes('jeoNumber')
    );
  }
}
