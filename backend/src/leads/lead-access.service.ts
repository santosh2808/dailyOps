import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LeadViewer } from './lead-visibility';

// Lead-access audit trail: who viewed, exported, copied or printed lead data.
// Rows go into the generic AuditLog table (module = 'LeadAccess'), so they are
// read through the existing audit-log endpoint (AuditLog.View) plus the
// summary below. Everything here is best-effort: a logging failure must never
// break the request being audited.
//
// Copy/print events are reported by the browser (see useLeadCopyAudit on the
// frontend). They record copy/cut/print actions in the app only — a screenshot
// or a photo of the screen cannot be detected by a website.
export const LEAD_ACCESS_MODULE = 'LeadAccess';
export const LEAD_ACCESS_ACTIONS = {
  VIEWED: 'Viewed',
  EXPORTED: 'Exported',
  COPIED: 'Copied',
  PRINTED: 'Printed',
} as const;

export type LeadClientEventType = 'COPY' | 'PRINT';

// Re-opening the same lead within this window is one "view", not many.
const VIEW_DEDUPE_MS = 5 * 60 * 1000;

// Flag thresholds for the summary (per user, over the chosen window).
export const SUSPICIOUS_THRESHOLDS = {
  copies: 10,
  exports: 3,
  prints: 10,
  distinctLeadsViewed: 100,
};

export interface LeadAccessSummaryRow {
  actorName: string;
  viewed: number;
  distinctLeadsViewed: number;
  exported: number;
  leadsExported: number;
  copied: number;
  printed: number;
  lastActivity: string;
  flags: string[];
}

@Injectable()
export class LeadAccessService {
  private readonly logger = new Logger(LeadAccessService.name);

  constructor(private prisma: PrismaService) {}

  private async write(
    action: string,
    viewer: LeadViewer & { name?: string },
    recordId: string | null,
    newValue: Record<string, unknown>,
    remarks?: string,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          module: LEAD_ACCESS_MODULE,
          recordId: recordId ?? undefined,
          action,
          actorName: viewer.name ?? undefined,
          newValue: { userId: viewer.id, roles: viewer.roles ?? [], ...newValue } as any,
          remarks,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to record lead access audit (${action}): ${(err as Error)?.message}`);
    }
  }

  async recordView(leadId: string, viewer: LeadViewer & { name?: string }, leadNumber?: string) {
    try {
      const recent = await this.prisma.auditLog.findFirst({
        where: {
          module: LEAD_ACCESS_MODULE,
          action: LEAD_ACCESS_ACTIONS.VIEWED,
          recordId: leadId,
          actorName: viewer.name ?? undefined,
          createdAt: { gte: new Date(Date.now() - VIEW_DEDUPE_MS) },
        },
        select: { id: true },
      });
      if (recent) return;
    } catch {
      // fall through and just log
    }
    await this.write(LEAD_ACCESS_ACTIONS.VIEWED, viewer, leadId, { leadNumber });
  }

  async recordExport(viewer: LeadViewer & { name?: string }, count: number) {
    await this.write(LEAD_ACCESS_ACTIONS.EXPORTED, viewer, null, { count }, `Exported ${count} lead(s) to Excel`);
  }

  async recordClientEvent(
    viewer: LeadViewer & { name?: string },
    type: LeadClientEventType,
    leadId: string | null,
    info: { chars?: number; page?: string },
  ) {
    const action = type === 'PRINT' ? LEAD_ACCESS_ACTIONS.PRINTED : LEAD_ACCESS_ACTIONS.COPIED;
    const where = leadId ? 'a lead page' : (info.page ?? 'the leads list');
    await this.write(
      action,
      viewer,
      leadId,
      { chars: info.chars, page: info.page },
      type === 'PRINT' ? `Printed ${where}` : `Copied ${info.chars ?? 0} character(s) from ${where}`,
    );
  }

  // Per-user totals over the last `days` days, with simple "worth a look"
  // flags. Aggregated in memory over at most MAX_ROWS recent events.
  async summary(days = 30): Promise<{ days: number; truncated: boolean; users: LeadAccessSummaryRow[] }> {
    const MAX_ROWS = 50000;
    const since = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.auditLog.findMany({
      where: { module: LEAD_ACCESS_MODULE, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
      select: { actorName: true, action: true, recordId: true, newValue: true, createdAt: true },
    });

    const byUser = new Map<string, LeadAccessSummaryRow & { _leads: Set<string> }>();
    for (const r of rows) {
      const name = r.actorName ?? 'Unknown';
      let u = byUser.get(name);
      if (!u) {
        u = {
          actorName: name,
          viewed: 0,
          distinctLeadsViewed: 0,
          exported: 0,
          leadsExported: 0,
          copied: 0,
          printed: 0,
          lastActivity: r.createdAt.toISOString(),
          flags: [],
          _leads: new Set(),
        };
        byUser.set(name, u);
      }
      if (r.action === LEAD_ACCESS_ACTIONS.VIEWED) {
        u.viewed += 1;
        if (r.recordId) u._leads.add(r.recordId);
      } else if (r.action === LEAD_ACCESS_ACTIONS.EXPORTED) {
        u.exported += 1;
        const count = Number((r.newValue as { count?: number } | null)?.count ?? 0);
        u.leadsExported += Number.isFinite(count) ? count : 0;
      } else if (r.action === LEAD_ACCESS_ACTIONS.COPIED) {
        u.copied += 1;
      } else if (r.action === LEAD_ACCESS_ACTIONS.PRINTED) {
        u.printed += 1;
      }
    }

    const users = [...byUser.values()].map(({ _leads, ...u }) => {
      u.distinctLeadsViewed = _leads.size;
      if (u.copied >= SUSPICIOUS_THRESHOLDS.copies) u.flags.push(`Copied ${u.copied} times`);
      if (u.exported >= SUSPICIOUS_THRESHOLDS.exports) u.flags.push(`Exported ${u.exported} times`);
      if (u.printed >= SUSPICIOUS_THRESHOLDS.prints) u.flags.push(`Printed ${u.printed} times`);
      if (u.distinctLeadsViewed >= SUSPICIOUS_THRESHOLDS.distinctLeadsViewed) {
        u.flags.push(`Opened ${u.distinctLeadsViewed} different leads`);
      }
      return u;
    });
    users.sort((a, b) => b.flags.length - a.flags.length || b.copied + b.exported - (a.copied + a.exported));

    return { days, truncated: rows.length >= MAX_ROWS, users };
  }
}
