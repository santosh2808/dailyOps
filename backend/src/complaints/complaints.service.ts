import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { UpdateComplaintDto } from './dto/update-complaint.dto';
import { UpdateComplaintStatusDto } from './dto/update-complaint-status.dto';
import { QueryComplaintDto } from './dto/query-complaint.dto';

const COMPLAINT_NUMBER_PREFIX = 'CMP-';
const COMPLAINT_NUMBER_PAD = 6;
const MAX_COMPLAINT_NUMBER_ATTEMPTS = 5;

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
} satisfies Prisma.ComplaintInclude;

const SORTABLE_FIELDS = ['createdAt', 'updatedAt', 'complaintNumber', 'status'] as const;

@Injectable()
export class ComplaintsService {
  private readonly logger = new Logger(ComplaintsService.name);

  constructor(
    private prisma: PrismaService,
    private auditLogService: AuditLogService,
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
        const created = await this.prisma.complaint.create({
          data: {
            complaintNumber,
            salesOrderId: dto.salesOrderId,
            subject: dto.subject,
            description: dto.description,
            createdBy,
          },
          include: COMPLAINT_DETAIL_INCLUDE,
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
