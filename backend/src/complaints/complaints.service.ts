import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ComplaintHistoryAction, LeadPriority, LeadSource, Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { MailerService } from '../mailer/mailer.service';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { UpdateComplaintDto } from './dto/update-complaint.dto';
import { UpdateComplaintStatusDto } from './dto/update-complaint-status.dto';
import { QueryComplaintDto } from './dto/query-complaint.dto';
import { LinkInvoiceDto } from './dto/link-invoice.dto';
import { ConvertToLeadDto } from './dto/convert-to-lead.dto';

const COMPLAINT_NUMBER_PREFIX = 'CMP-';
const COMPLAINT_NUMBER_PAD = 6;
const MAX_COMPLAINT_NUMBER_ATTEMPTS = 5;

// Additive: Complaint <-> Lead conversion shares this module's own LD-
// numbering convention rather than importing LeadsService (which would
// create a circular module dependency with LeadsService.convertToComplaint()
// — see the matching comment there). Each side stays self-contained and
// duplicates only this small numbering constant/helper.
const CONVERSION_LEAD_NUMBER_PREFIX = 'LD-';
const CONVERSION_LEAD_NUMBER_PAD = 6;
const MAX_CONVERSION_NUMBER_ATTEMPTS = 5;

// Statuses that count as "not yet resolved" for the Dashboard's Open
// Complaints KPI (see DashboardService.getStats()) — kept here, next to the
// enum's other meaning, so the two never drift apart.
export const OPEN_COMPLAINT_STATUSES = ['OPEN', 'IN_PROGRESS'] as const;

// Every read (list + detail) includes the same shape: the linked Sales
// Order, its Customer, and its most recent Proforma Invoice if one exists
// — this is exactly what "which customer, with invoice" needs, all reached
// through the one salesOrder relation (see Complaint's schema comment).
const COMPLAINT_DETAIL_INCLUDE = {
  salesOrder: {
    select: {
      id: true,
      salesOrderNumber: true,
      grandTotal: true,
      customer: {
        select: { id: true, companyName: true, contactPerson: true, phone: true, email: true },
      },
      proformaInvoices: {
        select: { id: true, invoiceNumber: true, grandTotal: true, status: true },
        orderBy: { createdAt: 'desc' as const },
        take: 1,
      },
    },
  },
  // Additive (Website Enquiries -> Lead/Complaint refactor, frontend Stage
  // 3): lets Complaint Details render a "Website Submission" card and the
  // Invoice Verification section's "already linked" state without a second
  // round-trip.
  sourceWebsite: { select: { id: true, code: true, name: true } },
  webFormIntake: {
    select: { id: true, referenceNumber: true, subjectLabel: true, submittedData: true, createdAt: true },
  },
  taxInvoice: { select: { id: true, invoiceNumber: true, invoiceDate: true } },
  // Bug fix (TC-043): "warranty" isn't a computable field anywhere in this
  // schema — Product.technicalSpec only ever carries it as free descriptive
  // text (warrantyMotor/warrantyDrive/warrantyOther, e.g. "36 months from
  // the date of erection"). Including it here lets Complaint Details show
  // that text next to the verified invoice/customer info instead of nothing
  // at all, without pretending there's a computed in-warranty/expired date
  // this data can't actually support.
  taxInvoiceItem: {
    select: {
      id: true,
      productName: true,
      productSku: true,
      product: { select: { id: true, name: true, technicalSpec: true } },
    },
  },
  // Bug fix (TC-059): list/detail views need to show who a complaint is
  // assigned to and which department owns it — both relations already
  // exist on the schema (set by createFromWebFormIntake()/manual
  // assignment), just weren't being fetched.
  assignedToUser: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
} satisfies Prisma.ComplaintInclude;

const SORTABLE_FIELDS = ['createdAt', 'updatedAt', 'complaintNumber', 'status'] as const;

// Additive (TC-061): column order for the Excel export.
const COMPLAINT_EXPORT_COLUMNS = [
  'complaintNumber',
  'subject',
  'source',
  'salesOrderNumber',
  'customerName',
  'status',
  'assignedTo',
  'department',
  'invoiceDisplay',
  'warrantyStatus',
  'ageInDays',
  'createdAt',
  'resolvedAt',
] as const;

type ComplaintWithDetail = Prisma.ComplaintGetPayload<{ include: typeof COMPLAINT_DETAIL_INCLUDE }>;

const WARRANTY_YEARS = 3;

// Bug fix (TC-043): warranty status must be computed as the VERIFIED
// invoice's own invoiceDate + 3 years — never from the complaint's
// createdAt, and never shown at all when the invoice hasn't been matched
// (taxInvoice is null for UNVERIFIED/NOT_FOUND complaints, so `warranty`
// naturally comes back null for those). Prisma has no portable computed-
// column feature, so this is a cheap, pure post-query map applied at every
// endpoint that returns a Complaint to the frontend.
function attachWarranty<T extends ComplaintWithDetail>(
  complaint: T,
): T & {
  warranty: { expiryDate: Date; isUnderWarranty: boolean } | null;
  ageInDays: number;
} {
  // Bug fix (TC-059): "how long has this complaint been open/how long did
  // it take to resolve" — whole days between createdAt and (resolvedAt if
  // resolved, else now). Never derived from the warranty expiry logic above.
  const endTime = complaint.resolvedAt ? new Date(complaint.resolvedAt).getTime() : Date.now();
  const ageInDays = Math.floor((endTime - new Date(complaint.createdAt).getTime()) / 86400000);

  if (!complaint.taxInvoice) {
    return { ...complaint, warranty: null, ageInDays };
  }
  const expiryDate = new Date(complaint.taxInvoice.invoiceDate);
  expiryDate.setFullYear(expiryDate.getFullYear() + WARRANTY_YEARS);
  return {
    ...complaint,
    warranty: { expiryDate, isUnderWarranty: expiryDate.getTime() > Date.now() },
    ageInDays,
  };
}

@Injectable()
export class ComplaintsService {
  private readonly logger = new Logger(ComplaintsService.name);

  constructor(
    private prisma: PrismaService,
    private auditLogService: AuditLogService,
    private mailerService: MailerService,
  ) {}

  // Extracted (TC-061) so the Excel export builds the exact same
  // where/orderBy findAll() does, instead of duplicating (and risking
  // drifting from) this filtering logic.
  private buildFindAllQuery(query: QueryComplaintDto): {
    where: Prisma.ComplaintWhereInput;
    orderBy: Prisma.ComplaintOrderByWithRelationInput;
  } {
    const search = query.search?.trim();

    const where: Prisma.ComplaintWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.salesOrderId ? { salesOrderId: query.salesOrderId } : {}),
      ...(search
        ? {
            OR: [
              { complaintNumber: { contains: search, mode: 'insensitive' } },
              { subject: { contains: search, mode: 'insensitive' } },
              { salesOrder: { salesOrderNumber: { contains: search, mode: 'insensitive' } } },
              { salesOrder: { customer: { companyName: { contains: search, mode: 'insensitive' } } } },
              // Bug fix (TC-058): web-form complaints have no salesOrder, so
              // they were unfindable by search except via
              // complaintNumber/subject — these cover their own reporter
              // contact fields and claimed invoice number directly.
              { reporterName: { contains: search, mode: 'insensitive' } },
              { reporterEmail: { contains: search, mode: 'insensitive' } },
              { reporterPhone: { contains: search, mode: 'insensitive' } },
              { claimedInvoiceNumber: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const sortBy = SORTABLE_FIELDS.includes(query.sortBy as (typeof SORTABLE_FIELDS)[number])
      ? (query.sortBy as (typeof SORTABLE_FIELDS)[number])
      : 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

    return { where, orderBy: { [sortBy]: sortOrder } };
  }

  async findAll(query: QueryComplaintDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { where, orderBy } = this.buildFindAllQuery(query);

    const [data, total] = await Promise.all([
      this.prisma.complaint.findMany({
        where,
        include: COMPLAINT_DETAIL_INCLUDE,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.complaint.count({ where }),
    ]);

    return {
      data: data.map(attachWarranty),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  // Additive (TC-061): mirrors findAll()'s filtering/sorting exactly (via
  // buildFindAllQuery) but returns every matching row as an .xlsx buffer
  // instead of a paginated page.
  async exportToExcel(query: QueryComplaintDto): Promise<Buffer> {
    const { where, orderBy } = this.buildFindAllQuery(query);
    const complaints = await this.prisma.complaint.findMany({
      where,
      include: COMPLAINT_DETAIL_INCLUDE,
      orderBy,
    });

    const rows = complaints.map(attachWarranty).map((complaint) => {
      const proformaInvoice = complaint.salesOrder?.proformaInvoices?.[0];
      const invoiceDisplay = complaint.taxInvoice
        ? complaint.taxInvoice.invoiceNumber
        : proformaInvoice
          ? `${proformaInvoice.invoiceNumber} (Proforma)`
          : complaint.claimedInvoiceNumber
            ? `${complaint.claimedInvoiceNumber} (unverified)`
            : '';

      const warrantyStatus = complaint.warranty
        ? complaint.warranty.isUnderWarranty
          ? 'Under Warranty'
          : 'Warranty Expired'
        : complaint.warrantyVerificationStatus === 'NOT_FOUND'
          ? 'Not Found'
          : '';

      return {
        complaintNumber: complaint.complaintNumber,
        subject: complaint.subject,
        source: complaint.source,
        salesOrderNumber: complaint.salesOrder?.salesOrderNumber ?? '',
        customerName: complaint.salesOrder?.customer?.companyName || complaint.reporterName || '',
        status: complaint.status,
        assignedTo: complaint.assignedToUser?.name ?? '',
        department: complaint.department?.name ?? '',
        invoiceDisplay,
        warrantyStatus,
        ageInDays: complaint.ageInDays,
        createdAt: complaint.createdAt.toISOString(),
        resolvedAt: complaint.resolvedAt ? complaint.resolvedAt.toISOString() : '',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows, { header: [...COMPLAINT_EXPORT_COLUMNS] });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Complaints');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  async findOne(id: string) {
    // Matches the Supplier/Lead convention: a direct lookup by id still
    // returns the record even if it has been soft-deleted; only the list
    // endpoint hides it by default.
    const complaint = await this.prisma.complaint.findUnique({
      where: { id },
      include: COMPLAINT_DETAIL_INCLUDE,
    });
    if (!complaint) {
      throw new NotFoundException('Complaint not found');
    }
    return attachWarranty(complaint);
  }

  async create(dto: CreateComplaintDto, createdBy?: string) {
    const salesOrder = await this.prisma.salesOrder.findUnique({ where: { id: dto.salesOrderId } });
    if (!salesOrder || salesOrder.deletedAt) {
      throw new NotFoundException('Sales Order not found');
    }

    for (let attempt = 1; attempt <= MAX_COMPLAINT_NUMBER_ATTEMPTS; attempt++) {
      const complaintNumber = await this.generateComplaintNumber();
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          const complaint = await tx.complaint.create({
            data: {
              complaintNumber,
              salesOrderId: dto.salesOrderId,
              subject: dto.subject,
              description: dto.description,
              createdBy,
            },
          });
          await this.logHistory(tx, complaint.id, 'CREATED', `Complaint ${complaint.complaintNumber} created`, createdBy);

          // Bug fix (TC-042/TC-048): Log Complaint now optionally captures an
          // invoice number up front — verify it immediately instead of
          // leaving every manually-logged complaint permanently UNVERIFIED
          // until a staff member separately runs the Invoice Verification
          // lookup on the Details page.
          if (dto.invoiceNumber?.trim()) {
            await this.autoVerifyInvoice(tx, complaint.id, dto.invoiceNumber.trim());
          }

          return tx.complaint.findUniqueOrThrow({ where: { id: complaint.id }, include: COMPLAINT_DETAIL_INCLUDE });
        });

        await this.auditLogService
          .record({
            module: 'Complaint',
            recordId: created.id,
            action: 'Created',
            actorName: createdBy,
            newValue: { complaintNumber: created.complaintNumber, subject: created.subject },
          })
          .catch((error) => this.logger.error('AuditLog record failed', error));

        // Bug fix (TC-048): Log Complaint previously never sent any
        // acknowledgement — a web-originated complaint already gets one via
        // PublicFormsService.sendSubmissionNotifications(); this is the same
        // send for a manually-logged one. Runs after the transaction commits
        // and never blocks/fails complaint creation (see method comment).
        // Bug fix (TC-063): staff can opt out of this send per-complaint
        // (e.g. logging on the customer's behalf when they don't want an
        // email) — defaults to sending, same as before, unless explicitly
        // set to false.
        if (dto.sendConfirmationEmail !== false) {
          await this.sendComplaintLoggedConfirmation(created).catch((error) =>
            this.logger.error('Complaint confirmation email failed', error),
          );
        }

        return attachWarranty(created);
      } catch (error) {
        if (this.isComplaintNumberConflict(error) && attempt < MAX_COMPLAINT_NUMBER_ATTEMPTS) {
          continue; // Another request took this number first — retry with a fresh one.
        }
        throw error;
      }
    }

    // Unreachable, but keeps TypeScript satisfied about the return type.
    throw new Error('Failed to generate a unique complaint number');
  }

  async update(id: string, dto: UpdateComplaintDto) {
    await this.findOne(id);
    const updated = await this.prisma.complaint.update({
      where: { id },
      data: dto,
      include: COMPLAINT_DETAIL_INCLUDE,
    });
    return attachWarranty(updated);
  }

  async updateStatus(id: string, dto: UpdateComplaintStatusDto, actorName?: string) {
    const existing = await this.findOne(id);
    const isResolving = dto.status === 'RESOLVED' || dto.status === 'CLOSED';

    const updated = await this.prisma.complaint.update({
      where: { id },
      data: {
        status: dto.status,
        resolutionNotes: dto.resolutionNotes ?? (isResolving ? existing.resolutionNotes : null),
        // Set once when it first resolves/closes; reopening (moving back to
        // OPEN/IN_PROGRESS) clears it rather than leaving a stale timestamp.
        resolvedAt: isResolving ? (existing.resolvedAt ?? new Date()) : null,
      },
      include: COMPLAINT_DETAIL_INCLUDE,
    });

    await this.auditLogService
      .record({
        module: 'Complaint',
        recordId: id,
        action: 'StatusChanged',
        actorName,
        oldValue: { status: existing.status },
        newValue: { status: updated.status },
      })
      .catch((error) => this.logger.error('AuditLog record failed', error));

    return attachWarranty(updated);
  }

  async remove(id: string, actorName?: string) {
    await this.findOne(id);
    const removed = await this.prisma.complaint.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.auditLogService
      .record({ module: 'Complaint', recordId: id, action: 'Deleted', actorName })
      .catch((error) => this.logger.error('AuditLog record failed', error));

    return removed;
  }

  // Additive: Website Enquiries -> Lead/Complaint refactor. Called only from
  // PublicFormsService, inside its own `$transaction` alongside the
  // WebFormIntake row it just created (see LeadsService.createFromWebFormIntake
  // for the mirror-image Lead path and its own field-mapping notes).
  //
  // Field-mapping decisions:
  //  - reporterName/reporterEmail/reporterPhone: the submitted contact
  //    fields, verbatim — a web-originated complaint may have no verified
  //    Customer/SalesOrder yet, hence these plain scalar reporter columns.
  //  - claimedInvoiceNumber: fields.invoiceNumber if the submitter supplied
  //    one — auto-verified against TaxInvoice immediately (see
  //    autoVerifyInvoice() below); staff can still correct a wrong/missing
  //    match manually via invoice-lookup/link-invoice afterwards.
  //  - subject/description: the resolved route's subjectLabel / the
  //    submitted message.
  //  - assignedToUserId/departmentId: the resolved route's own values, or
  //    null — never defaulted.
  //  - warrantyVerificationStatus starts UNVERIFIED and only ever changes
  //    from inside autoVerifyInvoice() (VERIFIED/NOT_FOUND) — never
  //    defaulted to anything else here.
  async createFromWebFormIntake(
    input: {
      formWebsiteId: string;
      webFormIntakeId: string;
      subjectCode: string;
      subjectLabel: string;
      name: string;
      email?: string | null;
      phone?: string | null;
      message?: string | null;
      invoiceNumber?: string | null;
      assignedToUserId?: string | null;
      departmentId?: string | null;
      submittedData?: Prisma.InputJsonValue;
    },
    tx: Prisma.TransactionClient,
  ) {
    const complaintNumber = await this.generateComplaintNumber();

    const complaint = await tx.complaint.create({
      data: {
        complaintNumber,
        source: 'WEB_FORM',
        salesOrderId: null,
        subject: input.subjectLabel,
        description: input.message || undefined,
        sourceWebsiteId: input.formWebsiteId,
        sourceSubjectCode: input.subjectCode,
        webFormIntakeId: input.webFormIntakeId,
        reporterName: input.name,
        reporterEmail: input.email || undefined,
        reporterPhone: input.phone || undefined,
        assignedToUserId: input.assignedToUserId ?? undefined,
        departmentId: input.departmentId ?? undefined,
        submittedData: input.submittedData,
        // claimedInvoiceNumber/warrantyVerificationStatus are set by
        // autoVerifyInvoice() below when the submitter gave a number;
        // otherwise both stay at their schema defaults (null / UNVERIFIED).
      },
    });

    await this.logHistory(
      tx,
      complaint.id,
      'CREATED',
      `Complaint ${complaint.complaintNumber} created from website submission (${input.subjectLabel})`,
    );

    // Bug fix (TC-042): auto-verify the submitter's claimed invoice number
    // right away, same as the manual Log Complaint path in create() —
    // previously this was left permanently UNVERIFIED until a staff member
    // ran the lookup by hand.
    if (input.invoiceNumber?.trim()) {
      await this.autoVerifyInvoice(tx, complaint.id, input.invoiceNumber.trim());
    }

    return tx.complaint.findUniqueOrThrow({ where: { id: complaint.id }, include: COMPLAINT_DETAIL_INCLUDE });
  }

  // Bug fix (TC-042): runs the same TaxInvoice match findInvoiceForLookup()
  // already implements, but automatically at complaint-creation time instead
  // of waiting for a separate manual "Look Up"/"Link Invoice" step. A match
  // sets taxInvoiceId/warrantyVerificationStatus VERIFIED and logs
  // INVOICE_LINKED (the same outcome linkInvoice() produces); no match sets
  // claimedInvoiceNumber/NOT_FOUND and logs INVOICE_NOT_FOUND so staff can
  // still see what was typed and correct it manually via the existing
  // lookup/link endpoints. Never throws — an unmatched or malformed number
  // must never block the complaint itself from being created.
  private async autoVerifyInvoice(tx: Prisma.TransactionClient, complaintId: string, invoiceNumber: string) {
    const invoice = await tx.taxInvoice.findUnique({ where: { invoiceNumber } });
    if (invoice) {
      await tx.complaint.update({
        where: { id: complaintId },
        data: {
          claimedInvoiceNumber: invoiceNumber,
          taxInvoiceId: invoice.id,
          warrantyVerificationStatus: 'VERIFIED',
        },
      });
      await this.logHistory(tx, complaintId, 'INVOICE_LINKED', `Automatically matched Tax Invoice ${invoice.invoiceNumber}`);
    } else {
      await tx.complaint.update({
        where: { id: complaintId },
        data: { claimedInvoiceNumber: invoiceNumber, warrantyVerificationStatus: 'NOT_FOUND' },
      });
      await this.logHistory(
        tx,
        complaintId,
        'INVOICE_NOT_FOUND',
        `No Tax Invoice found matching "${invoiceNumber}" — verify manually`,
      );
    }
  }

  // Bug fix (TC-048): the confirmation send for a manually-logged
  // complaint — mirrors PublicFormsService.sendSubmissionNotifications()'s
  // customer-acknowledgement send for a web-originated one (same Mailer/
  // EmailHistory pipeline, same "only if a recipient email is on file, never
  // fabricated" rule). A manual complaint has no reporterEmail of its own —
  // its only possible recipient is its Sales Order's Customer — so this
  // simply no-ops when that's unset, rather than failing the send.
  //
  // Bug fix (TC-063): this used to send under its own separate
  // 'COMPLAINT_LOGGED_CONFIRMATION' template key, distinct from the
  // web-form path's 'WEB_COMPLAINT_RECEIVED' — two near-identical templates
  // an admin had to keep in sync by hand on the Email Templates screen (and
  // easily wouldn't). Now unified onto the single WEB_COMPLAINT_RECEIVED key
  // PublicFormsService.sendSubmissionNotifications() already uses, with the
  // same {{referenceNumber}}/{{customerName}} vars — a manually-logged
  // complaint has no WebFormIntake.referenceNumber, so its own
  // complaintNumber fills that slot, which is exactly what the old
  // template showed anyway. See seed.ts's WEB_COMPLAINT_RECEIVED entry —
  // the old COMPLAINT_LOGGED_CONFIRMATION seed row is removed as unused.
  private async sendComplaintLoggedConfirmation(
    complaint: Prisma.ComplaintGetPayload<{ include: typeof COMPLAINT_DETAIL_INCLUDE }>,
  ) {
    const recipientEmail = complaint.salesOrder?.customer?.email;
    if (!recipientEmail) return;

    await this.mailerService.send({
      templateKey: 'WEB_COMPLAINT_RECEIVED',
      fallbackSubject: 'We received your request — {{referenceNumber}}',
      fallbackBodyHtml:
        '<div style="font-family:Arial;padding:20px">' +
        '<h2>Thank you for contacting Smart Rotamac Support</h2>' +
        '<p>Dear <b>{{customerName}}</b>,</p>' +
        '<p>Your warranty/service request has been received successfully.</p>' +
        '<div style="background:#F3F4F6;padding:15px;border-radius:8px">' +
        '<h3>Reference Number</h3>' +
        '<h1 style="color:#2563EB">{{referenceNumber}}</h1>' +
        '</div>' +
        '<p>Our support team will review your request and contact you shortly.</p>' +
        '<hr>' +
        '<p style="color:#6B7280">Smart Rotamac Support Team</p>' +
        '</div>',
      vars: {
        customerName: complaint.salesOrder?.customer?.companyName ?? 'Customer',
        referenceNumber: complaint.complaintNumber,
      },
      to: recipientEmail,
      link: { module: 'Complaint', complaintId: complaint.id },
    });
  }

  // Invoice lookup — the staff-facing step that turns a customer-typed,
  // unverified claimedInvoiceNumber into a real, linkable TaxInvoice. Never
  // fabricates a match: an unknown invoice number returns { found: false }.
  async findInvoiceForLookup(invoiceNumber: string) {
    const invoice = await this.prisma.taxInvoice.findUnique({
      where: { invoiceNumber },
      include: { items: { include: { product: true } } },
    });
    if (!invoice) {
      return { found: false as const };
    }
    return { found: true as const, invoice, items: invoice.items };
  }

  // Links a verified TaxInvoice (and optionally one specific line item) to
  // this complaint. Enforces that a selected item actually belongs to the
  // selected invoice (requirement §8) — a mismatched pair is rejected with a
  // 400 rather than silently linking an unrelated item.
  async linkInvoice(id: string, dto: LinkInvoiceDto, actorName?: string) {
    await this.findOne(id);

    const invoice = await this.prisma.taxInvoice.findUnique({ where: { id: dto.taxInvoiceId } });
    if (!invoice) {
      throw new NotFoundException('Tax invoice not found');
    }

    if (dto.taxInvoiceItemId) {
      const item = await this.prisma.taxInvoiceItem.findFirst({
        where: { id: dto.taxInvoiceItemId, taxInvoiceId: dto.taxInvoiceId },
      });
      if (!item) {
        throw new BadRequestException('The selected invoice item does not belong to the selected invoice');
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const complaint = await tx.complaint.update({
        where: { id },
        data: {
          taxInvoiceId: dto.taxInvoiceId,
          taxInvoiceItemId: dto.taxInvoiceItemId ?? null,
          warrantyVerificationStatus: 'VERIFIED',
        },
        include: COMPLAINT_DETAIL_INCLUDE,
      });
      await this.logHistory(
        tx,
        id,
        'INVOICE_LINKED',
        `Linked to Tax Invoice ${invoice.invoiceNumber}`,
        actorName,
      );
      return complaint;
    });

    await this.auditLogService
      .record({
        module: 'Complaint',
        recordId: id,
        action: 'InvoiceLinked',
        actorName,
        newValue: { taxInvoiceId: dto.taxInvoiceId, taxInvoiceItemId: dto.taxInvoiceItemId ?? null },
      })
      .catch((error) => this.logger.error('AuditLog record failed', error));

    return attachWarranty(updated);
  }

  // Staff-facing reply to whoever reported this complaint — covers exactly
  // the case an unverified/not-found invoice number needs: telling the
  // customer their invoice couldn't be matched and asking them to check it,
  // or any other back-and-forth. Reuses the same Mailer/EmailHistory
  // pipeline every other module already uses (never a separate ad hoc
  // send), and the recipient is always resolved server-side — a manual
  // complaint's customer email comes from its Sales Order, a web-form
  // complaint's from its own reporterEmail — never accepted from the
  // request body.
  async replyToCustomer(id: string, message: string, actorName?: string) {
    const complaint = await this.findOne(id);
    const recipientEmail = complaint.reporterEmail || complaint.salesOrder?.customer?.email;
    if (!recipientEmail) {
      throw new BadRequestException('This complaint has no customer email on file to reply to');
    }

    const result = await this.mailerService.send({
      fallbackSubject: `Update on your complaint ${complaint.complaintNumber}`,
      fallbackBodyHtml: `<p>${message.replace(/\n/g, '<br/>')}</p>`,
      vars: {},
      to: recipientEmail,
      actorName,
      link: { module: 'Complaint', complaintId: id },
    });

    await this.prisma.complaintHistory.create({
      data: {
        complaintId: id,
        action: 'CUSTOMER_REPLIED',
        description:
          result.status === 'FAILED'
            ? `Reply to customer failed to send: ${result.errorMessage ?? 'unknown error'}`
            : `Replied to customer (${recipientEmail})`,
        performedBy: actorName,
      },
    });

    return result;
  }

  async getEmailHistory(id: string) {
    await this.findOne(id);
    return this.prisma.emailHistory.findMany({
      where: { complaintId: id },
      orderBy: { sentAt: 'desc' },
    });
  }

  // Additive: Complaint <-> Lead conversion — mirrors
  // LeadsService.convertToComplaint() exactly in shape. Requires the caller
  // to hold both Complaint.Edit and Lead.Create (see ComplaintsController).
  async convertToLead(id: string, actorName?: string, dto?: ConvertToLeadDto) {
    const complaint = await this.findOne(id);
    if (complaint.convertedToLeadId) {
      throw new ConflictException('This complaint has already been converted to a lead');
    }

    for (let attempt = 1; attempt <= MAX_CONVERSION_NUMBER_ATTEMPTS; attempt++) {
      const leadNumber = await this.generateConversionLeadNumber();
      try {
        return await this.prisma.$transaction(async (tx) => {
          const contactPerson = complaint.reporterName || 'Unknown';
          const lead = await tx.lead.create({
            data: {
              leadNumber,
              companyName: contactPerson,
              contactPerson,
              email: complaint.reporterEmail ?? undefined,
              phone: complaint.reporterPhone || '',
              title: complaint.subject,
              description: complaint.description ?? undefined,
              remarks: `Converted from Complaint ${complaint.complaintNumber}`,
              // A complaint with a website origin carries that origin
              // forward; a purely internal (staff-logged) complaint has no
              // web origin at all, so LeadSource.OTHER is the closest
              // existing value — there is no dedicated
              // "converted from complaint" source in this schema.
              source: complaint.sourceWebsiteId ? LeadSource.WEBSITE : LeadSource.OTHER,
              priority: LeadPriority.MEDIUM,
              sourceWebsiteId: complaint.sourceWebsiteId,
              sourceSubjectCode: complaint.sourceSubjectCode,
              webFormIntakeId: complaint.webFormIntakeId,
              assignedToUserId: complaint.assignedToUserId,
            },
          });

          await tx.complaint.update({
            where: { id },
            data: { deletedAt: new Date(), convertedToLeadId: lead.id },
          });

          await tx.leadComplaintConversion.create({
            data: {
              direction: 'COMPLAINT_TO_LEAD',
              sourceComplaintId: id,
              targetLeadId: lead.id,
              convertedBy: actorName,
              reason: dto?.reason,
            },
          });

          await this.logHistory(
            tx,
            id,
            'CONVERTED_TO_LEAD',
            `Converted to Lead ${lead.leadNumber}`,
            actorName,
          );
          await tx.leadHistory.create({
            data: {
              leadId: lead.id,
              action: 'CREATED',
              description: `Lead ${lead.leadNumber} created from Complaint ${complaint.complaintNumber} conversion`,
              performedBy: actorName,
            },
          });

          return { id: lead.id, leadNumber: lead.leadNumber };
        });
      } catch (error) {
        if (this.isConversionLeadNumberConflict(error) && attempt < MAX_CONVERSION_NUMBER_ATTEMPTS) {
          continue; // Another request took this number first — retry with a fresh one.
        }
        throw error;
      }
    }

    throw new Error('Failed to generate a unique lead number');
  }

  // Appends one append-only ComplaintHistory row, mirroring
  // LeadsService.logHistory() exactly. Every write path above calls this
  // from inside its own $transaction so the history entry can never be left
  // behind by a failed/partial update.
  private async logHistory(
    tx: Prisma.TransactionClient,
    complaintId: string,
    action: ComplaintHistoryAction,
    description: string,
    performedBy?: string,
  ) {
    await tx.complaintHistory.create({
      data: { complaintId, action, description, performedBy },
    });
  }

  private async generateConversionLeadNumber(): Promise<string> {
    const last = await this.prisma.lead.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { leadNumber: true },
    });
    const lastSeq = last ? parseInt(last.leadNumber.replace(CONVERSION_LEAD_NUMBER_PREFIX, ''), 10) || 0 : 0;
    return `${CONVERSION_LEAD_NUMBER_PREFIX}${String(lastSeq + 1).padStart(CONVERSION_LEAD_NUMBER_PAD, '0')}`;
  }

  private isConversionLeadNumberConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      Array.isArray(error.meta?.target) &&
      (error.meta?.target as string[]).includes('leadNumber')
    );
  }

  private async generateComplaintNumber(): Promise<string> {
    const last = await this.prisma.complaint.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { complaintNumber: true },
    });
    const lastSeq = last ? parseInt(last.complaintNumber.replace(COMPLAINT_NUMBER_PREFIX, ''), 10) || 0 : 0;
    return `${COMPLAINT_NUMBER_PREFIX}${String(lastSeq + 1).padStart(COMPLAINT_NUMBER_PAD, '0')}`;
  }

  private isComplaintNumberConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      Array.isArray(error.meta?.target) &&
      (error.meta?.target as string[]).includes('complaintNumber')
    );
  }
}
