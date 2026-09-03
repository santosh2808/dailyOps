import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ComplaintHistoryAction, LeadPriority, LeadSource, Prisma } from '@prisma/client';
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
  taxInvoice: { select: { id: true, invoiceNumber: true } },
  taxInvoiceItem: { select: { id: true, productName: true, productSku: true } },
} satisfies Prisma.ComplaintInclude;

const SORTABLE_FIELDS = ['createdAt', 'updatedAt', 'complaintNumber', 'status'] as const;

@Injectable()
export class ComplaintsService {
  private readonly logger = new Logger(ComplaintsService.name);

  constructor(
    private prisma: PrismaService,
    private auditLogService: AuditLogService,
    private mailerService: MailerService,
  ) {}

  async findAll(query: QueryComplaintDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
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
            ],
          }
        : {}),
    };

    const sortBy = SORTABLE_FIELDS.includes(query.sortBy as (typeof SORTABLE_FIELDS)[number])
      ? (query.sortBy as (typeof SORTABLE_FIELDS)[number])
      : 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

    const [data, total] = await Promise.all([
      this.prisma.complaint.findMany({
        where,
        include: COMPLAINT_DETAIL_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.complaint.count({ where }),
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
    return complaint;
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
            include: COMPLAINT_DETAIL_INCLUDE,
          });
          await this.logHistory(tx, complaint.id, 'CREATED', `Complaint ${complaint.complaintNumber} created`, createdBy);
          return complaint;
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

        return created;
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
    return this.prisma.complaint.update({
      where: { id },
      data: dto,
      include: COMPLAINT_DETAIL_INCLUDE,
    });
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

    return updated;
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
  //    one — unverified until staff runs the invoice lookup (linkInvoice()
  //    below).
  //  - subject/description: the resolved route's subjectLabel / the
  //    submitted message.
  //  - assignedToUserId/departmentId: the resolved route's own values, or
  //    null — never defaulted.
  //  - warrantyVerificationStatus always starts UNVERIFIED.
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
        claimedInvoiceNumber: input.invoiceNumber || undefined,
        assignedToUserId: input.assignedToUserId ?? undefined,
        departmentId: input.departmentId ?? undefined,
        submittedData: input.submittedData,
        warrantyVerificationStatus: 'UNVERIFIED',
      },
      include: COMPLAINT_DETAIL_INCLUDE,
    });

    await this.logHistory(
      tx,
      complaint.id,
      'CREATED',
      `Complaint ${complaint.complaintNumber} created from website submission (${input.subjectLabel})`,
    );

    return complaint;
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

    return updated;
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
