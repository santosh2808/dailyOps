import { Injectable } from '@nestjs/common';
import { LeadSource, LeadStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface LeadSourceSummaryEntry {
  source: LeadSource;
  count: number;
}

// Additive: Sales Automation "Sales by Executive" widget — grouped by
// SalesOrder.createdBy, the plain actor-name scalar already captured on
// every Sales Order (see that model's own comment on why it's a scalar,
// not a User relation). A Sales Order with no createdBy (shouldn't happen
// via the app, but possible via direct DB access) is grouped under
// "Unknown".
export interface SalesByExecutiveEntry {
  executive: string;
  orderCount: number;
  totalValue: number;
}

export interface DashboardStats {
  customers: number;
  products: number;
  leads: number;
  quotations: number;
  salesOrders: number;
  proformaInvoices: number;
  jeoPending: number;
  materialsCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  suppliers: number;
  // Additive: Lead follow-up + source widgets (requirement #9). Terminal
  // statuses (WON/LOST) are excluded from both follow-up
  // counts — a closed lead's follow-up date is no longer operationally
  // meaningful — but leadSourceSummary counts every open, non-deleted lead
  // regardless of status.
  todaysFollowUpsCount: number;
  overdueFollowUpsCount: number;
  leadSourceSummary: LeadSourceSummaryEntry[];
  // Additive: Sales Automation Dashboard widgets (requirement #14).
  upcomingFollowUpsCount: number;
  pendingQuotationsCount: number;
  sentQuotationsCount: number;
  acceptedQuotationsCount: number;
  ordersAwaitingProductionCount: number;
  ordersInProductionCount: number;
  salesByExecutive: SalesByExecutiveEntry[];
}

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats(): Promise<DashboardStats> {
    // Local day boundaries (server time) — "Today" for follow-ups means the
    // calendar day this request lands on, not a rolling 24h window.
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
    // Upcoming Follow-ups (requirement #14): the 7 days after today,
    // deliberately excluding today itself (that's "Today's Follow-ups")
    // and anything already overdue.
    const startOfUpcomingWindowEnd = new Date(startOfTomorrow);
    startOfUpcomingWindowEnd.setDate(startOfUpcomingWindowEnd.getDate() + 7);

    // Closed/terminal leads are excluded from both follow-up counts — see
    // the DashboardStats field comment.
    const openLeadWhere = {
      deletedAt: null,
      // Prisma's `notIn` expects a mutable LeadStatus[] — `as const` here
      // would produce a readonly tuple, which Prisma's generated input type
      // rejects, so the array is typed as LeadStatus[] directly instead.
      status: { notIn: ['WON', 'LOST'] as LeadStatus[] },
    };

    const [
      customers,
      products,
      leads,
      quotations,
      salesOrders,
      proformaInvoices,
      jeoPending,
      materialsCount,
      outOfStockCount,
      lowStockCandidates,
      suppliers,
      todaysFollowUpsCount,
      overdueFollowUpsCount,
      leadSourceGroups,
      upcomingFollowUpsCount,
      pendingQuotationsCount,
      sentQuotationsCount,
      acceptedQuotationsCount,
      ordersAwaitingProductionCount,
      ordersInProductionCount,
      salesOrdersForExecutiveSummary,
    ] = await Promise.all([
      this.prisma.customer.count({ where: { isActive: true } }),
      this.prisma.product.count({ where: { isActive: true } }),
      // Lead, Quotation, and SalesOrder all use deletedAt (not isActive) for
      // soft delete, matching the convention in their own findAll() methods.
      // Excludes soft-deleted rows so these counts stay in sync with their
      // respective list pages.
      this.prisma.lead.count({ where: { deletedAt: null } }),
      this.prisma.quotation.count({ where: { deletedAt: null } }),
      this.prisma.salesOrder.count({ where: { deletedAt: null } }),
      // ProformaInvoice has no deletedAt/isActive column (see schema.prisma
      // comment) — CANCELLED is its equivalent "no longer active" state, so
      // this excludes cancelled invoices instead.
      this.prisma.proformaInvoice.count({ where: { status: { not: 'CANCELLED' } } }),
      // "JEO Pending Count" per scope — literally status === PENDING (JEOs
      // that haven't started production at all yet), not "not completed".
      this.prisma.jobExecutionOrder.count({ where: { status: 'PENDING' } }),
      this.prisma.material.count({ where: { isActive: true } }),
      // Out Of Stock: currentStock <= 0 — a single-column comparison, so a
      // direct count works.
      this.prisma.material.count({ where: { isActive: true, currentStock: { lte: 0 } } }),
      // Low Stock: 0 < currentStock <= reorderLevel — this compares two
      // columns against each other, which Prisma's `where` cannot express
      // directly. Fetch the (small) set of active, non-zero-stock materials
      // and filter in memory, same approach used in
      // materials.service.ts findAll() for the identical comparison.
      this.prisma.material.findMany({
        where: { isActive: true, currentStock: { gt: 0 } },
        select: { currentStock: true, reorderLevel: true },
      }),
      // Supplier uses deletedAt (not isActive) for soft delete, same
      // convention as Lead/Quotation/SalesOrder — excludes soft-deleted
      // rows so this count stays in sync with the Supplier list page.
      this.prisma.supplier.count({ where: { deletedAt: null } }),
      // Today's Follow-ups: nextFollowUp falls within [startOfToday, startOfTomorrow).
      this.prisma.lead.count({
        where: { ...openLeadWhere, nextFollowUp: { gte: startOfToday, lt: startOfTomorrow } },
      }),
      // Overdue Follow-ups: nextFollowUp was before today and still hasn't
      // been actioned (lead is still open).
      this.prisma.lead.count({
        where: { ...openLeadWhere, nextFollowUp: { lt: startOfToday } },
      }),
      // Lead Source Summary: distribution of every non-deleted lead by
      // source, regardless of status (closed leads still count toward
      // "where did our leads come from").
      this.prisma.lead.groupBy({
        by: ['source'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      // Upcoming Follow-ups: the 7 days strictly after today.
      this.prisma.lead.count({
        where: { ...openLeadWhere, nextFollowUp: { gte: startOfTomorrow, lt: startOfUpcomingWindowEnd } },
      }),
      // Pending Quotations: drafted/reviewed but not yet sent to the
      // customer (DRAFT or READY).
      this.prisma.quotation.count({ where: { deletedAt: null, status: { in: ['DRAFT', 'READY'] } } }),
      this.prisma.quotation.count({ where: { deletedAt: null, status: 'SENT' } }),
      this.prisma.quotation.count({ where: { deletedAt: null, status: 'ACCEPTED' } }),
      // Orders Awaiting Production: confirmed but production hasn't
      // started yet.
      this.prisma.salesOrder.count({ where: { deletedAt: null, status: 'CONFIRMED' } }),
      this.prisma.salesOrder.count({ where: { deletedAt: null, status: 'PRODUCTION_STARTED' } }),
      // Sales by Executive: grouped in memory (not groupBy()) — see the
      // JEO Production Dashboard comment on why this codebase avoids
      // Prisma's groupBy() for aggregation; the Sales Order table is small
      // enough that this is a non-issue.
      this.prisma.salesOrder.findMany({
        where: { deletedAt: null },
        select: { createdBy: true, grandTotal: true },
      }),
    ]);

    const salesByExecutiveMap = new Map<string, { orderCount: number; totalValue: number }>();
    for (const order of salesOrdersForExecutiveSummary) {
      const key = order.createdBy || 'Unknown';
      const entry = salesByExecutiveMap.get(key) ?? { orderCount: 0, totalValue: 0 };
      entry.orderCount += 1;
      entry.totalValue += order.grandTotal;
      salesByExecutiveMap.set(key, entry);
    }
    const salesByExecutive: SalesByExecutiveEntry[] = Array.from(salesByExecutiveMap.entries())
      .map(([executive, { orderCount, totalValue }]) => ({
        executive,
        orderCount,
        totalValue: Math.round(totalValue * 100) / 100,
      }))
      .sort((a, b) => b.totalValue - a.totalValue);

    const lowStockCount = lowStockCandidates.filter(
      (material) => material.currentStock <= material.reorderLevel,
    ).length;

    const leadSourceSummary: LeadSourceSummaryEntry[] = leadSourceGroups.map((group) => ({
      source: group.source,
      count: group._count._all,
    }));

    return {
      customers,
      products,
      leads,
      quotations,
      salesOrders,
      proformaInvoices,
      jeoPending,
      materialsCount,
      lowStockCount,
      outOfStockCount,
      suppliers,
      todaysFollowUpsCount,
      overdueFollowUpsCount,
      leadSourceSummary,
      upcomingFollowUpsCount,
      pendingQuotationsCount,
      sentQuotationsCount,
      acceptedQuotationsCount,
      ordersAwaitingProductionCount,
      ordersInProductionCount,
      salesByExecutive,
    };
  }
}
