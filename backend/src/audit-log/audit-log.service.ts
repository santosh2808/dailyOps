import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';

// Whitelisted so `sortBy` from the query string can never be used to sort by
// an arbitrary/unindexed column — same convention as every other
// findAll()/sortBy in this codebase.
const SORTABLE_FIELDS = ['createdAt', 'module', 'action'] as const;

@Injectable()
export class AuditLogService {
  constructor(private prisma: PrismaService) {}

  // Generic, cross-module audit trail (requirement #15 — "Every important
  // action should be logged"). Deliberately fire-and-forget-safe: every
  // call site awaits this, but a failure here should never be allowed to
  // roll back or reject the business operation it's describing, so callers
  // wrap it in a best-effort try/catch (see the module-specific services).
  // `oldValue`/`newValue` accept any plain-object snapshot; only the fields
  // that actually matter for that action are expected to be passed in, not
  // a full row dump.
  record(entry: {
    module: string;
    recordId?: string | null;
    action: string;
    actorName?: string | null;
    oldValue?: Record<string, unknown> | null;
    newValue?: Record<string, unknown> | null;
    remarks?: string | null;
  }) {
    return this.prisma.auditLog.create({
      data: {
        module: entry.module,
        recordId: entry.recordId ?? undefined,
        action: entry.action,
        actorName: entry.actorName ?? undefined,
        oldValue: (entry.oldValue ?? undefined) as Prisma.InputJsonValue | undefined,
        newValue: (entry.newValue ?? undefined) as Prisma.InputJsonValue | undefined,
        remarks: entry.remarks ?? undefined,
      },
    });
  }

  async findAll(query: QueryAuditLogDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.AuditLogWhereInput = {
      ...(query.module ? { module: query.module } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.recordId ? { recordId: query.recordId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    const sortBy = SORTABLE_FIELDS.includes(query.sortBy as (typeof SORTABLE_FIELDS)[number])
      ? (query.sortBy as (typeof SORTABLE_FIELDS)[number])
      : 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }
}
