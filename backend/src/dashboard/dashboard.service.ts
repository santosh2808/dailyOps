import { Injectable } from '@nestjs/common';
import { LeadSource, LeadStatus, Prisma, SalesOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OPEN_COMPLAINT_STATUSES } from '../complaints/complaints.service';

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
  // Additive: Dashboard Redesign — KPI/notification widgets (requirements
  // #1 and #8). "Dispatch" is deliberately just status = DISPATCHED (not
  // the broader "reached dispatch or beyond" cumulative count getFunnel()
  // uses for its own last stage) — a KPI card's number and its click-through
  // destination filter should always describe the exact same set of
  // records, and DISPATCHED is the one unambiguous single-status filter
  // the Sales Orders list already supports.
  dispatchCount: number;
  // Delayed Orders: still open (not dispatched/completed/cancelled) with a
  // deliveryDate that has already passed.
  delayedOrdersCount: number;
  // Pending Approvals: QuotationApprovalRequest rows awaiting a decision —
  // see quotations.service.ts for how these get created/decided.
  pendingApprovalsCount: number;
  // Additive: Complaints module — complaints not yet resolved (OPEN or
  // IN_PROGRESS), for the Dashboard's Open Complaints KPI card (replaces
  // the old Revenue (This Month) card — see Dashboard.tsx).
  openComplaintsCount: number;
}

// Additive: Dashboard Redesign — Sales Funnel (requirement #2). Each stage
// is a *cumulative* "reached this stage or beyond" count (not "currently
// sitting at this exact status"), so the series is naturally monotonically
// non-increasing left-to-right, which is what a funnel chart expects. Lead
// stages use LeadStatus's own natural progression order; Sales Order stages
// use SalesOrderStatus's — CANCELLED orders are excluded throughout rather
// than counted as having "reached" any stage.
export interface FunnelStage {
  stage: string;
  count: number;
}

// Additive: Dashboard Redesign — Revenue chart (requirement #4). `label` is
// a display-ready bucket name (e.g. "Jan", "Q2 2026", "Week 3", "2026");
// `value` is the summed SalesOrder.grandTotal for that bucket, rounded the
// same way salesByExecutive.totalValue is above.
export interface RevenuePoint {
  label: string;
  value: number;
}

export type RevenuePeriod = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

// Additive: Dashboard Redesign — Sales Executive Performance (requirement
// #5). `revenue`/`orders` are keyed off SalesOrder.createdBy the same way
// salesByExecutive is (see that field's comment on why it's a name string,
// not a User relation). `wonPercent` is computed separately, from
// Lead.assignedToUserId (the one place this schema *does* have a real FK to
// User) as WON / (WON + LOST) among that user's closed leads — so it's only
// populated for executives whose SalesOrder.createdBy name matches an
// active Sales Executive/Sales Manager User by name; anyone else (e.g. a
// renamed or deactivated user, or a typo'd name) gets wonPercent: 0 rather
// than a crash, since there's no reliable way to resolve the name to a
// User row in that case.
export interface ExecutivePerformanceEntry {
  executive: string;
  revenue: number;
  orders: number;
  wonPercent: number;
}

// Additive: Dashboard Redesign — donut charts (requirement #3). `label` is
// display-ready (already humanized), not the raw enum value.
export interface StatusBreakdownEntry {
  label: string;
  count: number;
}

export interface DashboardCharts {
  leadStatus: StatusBreakdownEntry[];
  // Additive: Dashboard Redesign v2 — Quotation Status donut (v2
  // requirement #7, replacing v1's separate Lead Status donut in the
  // frontend's own widget list — leadStatus above is left in place,
  // unused by v2's page, rather than removed, since removing a field is
  // more likely to break something than an unused extra one).
  quotationStatus: StatusBreakdownEntry[];
  // Production Status buckets JeoStatus's 6 values into the 4 named in
  // requirement #6: Pending (PENDING), In Production (MATERIAL_READY +
  // ASSEMBLY_STARTED + QC), Ready (READY_FOR_DISPATCH), Completed
  // (COMPLETED).
  productionStatus: StatusBreakdownEntry[];
  // Inventory Status buckets every active Material into the 4 named in
  // requirement #7, using the two threshold columns Material already has:
  // Out Of Stock (currentStock <= 0), Critical (0 < currentStock <=
  // minimumStock), Low Stock (minimumStock < currentStock <= reorderLevel),
  // Healthy (currentStock > reorderLevel). This assumes minimumStock <=
  // reorderLevel, which is how those two columns are described in the
  // Material model's own comments (minimum floor vs. reorder trigger).
  inventoryStatus: StatusBreakdownEntry[];
}

// Additive: Dashboard Redesign v2 — India Sales Map (requirement #1-4).
// `state` is one of INDIA_STATES (backend/src/common/india-states.ts), or
// "Unknown" for Sales Orders whose Customer has no state set yet.
export interface StateSalesEntry {
  state: string;
  revenue: number;
  orders: number;
  customers: number;
}

// Additive: Dashboard Redesign v2 — Top Products (requirement #12). Sums
// every SalesOrderItem for that product across non-cancelled, non-deleted
// Sales Orders — i.e. what's actually been sold, not quoted.
export interface TopProductEntry {
  productId: string;
  name: string;
  revenue: number;
  quantity: number;
}

// Additive: Dashboard Redesign v2 — Recent Activities timeline
// (requirement #10). A thin pass-through over the existing AuditLog table
// (see audit-log.service.ts) — no new logging added, just read the latest
// rows.
export interface RecentActivityEntry {
  id: string;
  module: string;
  action: string;
  actorName: string | null;
  remarks: string | null;
  createdAt: Date;
}

// Additive: Dashboard Redesign v2 — Today's Follow-ups list (requirement
// #11). getStats().todaysFollowUpsCount already gives the count; this is
// the same underlying query, just returning the actual Lead rows instead
// of a number.
export interface TodaysFollowUpEntry {
  id: string;
  leadNumber: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  nextFollowUp: Date | null;
  assignedToName: string | null;
}

// Additive: Dashboard Redesign v2 — Global Filters (requirement #13).
// Shared shape for the four filter dimensions that apply across the
// SalesOrder-derived widgets (India Map, Top Products, Executive
// Performance, and Revenue) — see QueryDashboardFiltersDto's own comment
// for which endpoints use which fields and why "month" isn't part of
// Revenue's usage of this.
interface SalesOrderFilterInput {
  month?: number;
  year?: number;
  state?: string;
  executive?: string;
  leadSource?: LeadSource;
  productId?: string;
}

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  // Additive: Dashboard Redesign v2 — Global Filters (requirement #13).
  // Shared by getSalesByState/getTopProducts/getExecutivePerformance/
  // getRevenue so the 4 non-date filter dimensions (state/executive/
  // leadSource/productId) are built identically everywhere, plus the
  // month/year date range for the three widgets that use it (Revenue
  // handles its own date range separately — see its own comment).
  private buildSalesOrderWhere(filters: SalesOrderFilterInput, includeMonthYear: boolean): Prisma.SalesOrderWhereInput {
    const where: Prisma.SalesOrderWhereInput = {
      deletedAt: null,
      status: { not: 'CANCELLED' },
    };
    if (includeMonthYear && (filters.month || filters.year)) {
      const now = new Date();
      const year = filters.year ?? now.getFullYear();
      if (filters.month) {
        where.orderDate = { gte: new Date(year, filters.month - 1, 1), lt: new Date(year, filters.month, 1) };
      } else {
        where.orderDate = { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) };
      }
    }
    if (filters.state) where.customer = { state: filters.state };
    if (filters.executive) where.createdBy = filters.executive;
    if (filters.productId) where.items = { some: { productId: filters.productId } };
    // Best-effort — see QueryDashboardFiltersDto's own comment: only
    // matches orders whose Quotation traces back to a Lead with this
    // source; direct customer-to-quotation orders are excluded.
    if (filters.leadSource) where.quotation = { lead: { source: filters.leadSource } };
    return where;
  }

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
      dispatchCount,
      delayedOrdersCount,
      pendingApprovalsCount,
      openComplaintsCount,
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
      // Dispatch KPI — see the DashboardStats.dispatchCount field comment
      // on why this is exactly status = DISPATCHED, not a cumulative range.
      this.prisma.salesOrder.count({
        where: { deletedAt: null, status: 'DISPATCHED' as SalesOrderStatus },
      }),
      // Delayed Orders — still open, past their promised deliveryDate.
      this.prisma.salesOrder.count({
        where: {
          deletedAt: null,
          status: { notIn: ['DISPATCHED', 'COMPLETED', 'CANCELLED'] as SalesOrderStatus[] },
          deliveryDate: { lt: startOfToday },
        },
      }),
      this.prisma.quotationApprovalRequest.count({ where: { status: 'PENDING' } }),
      // Additive: Complaints module — see DashboardStats.openComplaintsCount.
      this.prisma.complaint.count({
        where: { deletedAt: null, status: { in: [...OPEN_COMPLAINT_STATUSES] } },
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
      dispatchCount,
      delayedOrdersCount,
      pendingApprovalsCount,
      openComplaintsCount,
    };
  }

  // Additive: Dashboard Redesign — Sales Funnel (requirement #2).
  async getFunnel(): Promise<FunnelStage[]> {
    // LeadStatus's own declared progression order (WON is the terminal
    // "reached everything" state; LOST is excluded — a lost lead didn't
    // reach Qualified/Quotation/Won just because it's no longer open).
    const qualifiedOnwards: LeadStatus[] = ['QUALIFIED', 'QUOTATION_SENT', 'WON'];

    const [
      leadTotal,
      qualifiedCount,
      quotationTotal,
      wonQuotations,
      salesOrderTotal,
      productionOnwards,
      dispatchOnwards,
    ] = await Promise.all([
      this.prisma.lead.count({ where: { deletedAt: null } }),
      this.prisma.lead.count({ where: { deletedAt: null, status: { in: qualifiedOnwards } } }),
      this.prisma.quotation.count({ where: { deletedAt: null } }),
      // "Won" sits between Quotation and Sales Order in this funnel — a
      // Sales Order can only be created from an ACCEPTED Quotation (see
      // SalesOrder's own schema comment), so ACCEPTED is the "won the deal"
      // milestone, not Lead.status = WON (that's a Lead-side label, applied
      // later when the lead itself is closed out).
      this.prisma.quotation.count({ where: { deletedAt: null, status: 'ACCEPTED' } }),
      this.prisma.salesOrder.count({
        where: { deletedAt: null, status: { not: 'CANCELLED' as SalesOrderStatus } },
      }),
      this.prisma.salesOrder.count({
        where: {
          deletedAt: null,
          status: {
            in: ['PRODUCTION_STARTED', 'READY_FOR_DISPATCH', 'DISPATCHED', 'COMPLETED'] as SalesOrderStatus[],
          },
        },
      }),
      this.prisma.salesOrder.count({
        where: {
          deletedAt: null,
          status: { in: ['READY_FOR_DISPATCH', 'DISPATCHED', 'COMPLETED'] as SalesOrderStatus[] },
        },
      }),
    ]);

    return [
      { stage: 'Lead', count: leadTotal },
      { stage: 'Qualified', count: qualifiedCount },
      { stage: 'Quotation', count: quotationTotal },
      { stage: 'Won', count: wonQuotations },
      { stage: 'Sales Order', count: salesOrderTotal },
      { stage: 'Production', count: productionOnwards },
      { stage: 'Dispatch', count: dispatchOnwards },
    ];
  }

  // Additive: Dashboard Redesign — Revenue chart (requirement #4). No date
  // library in this backend (see other date-boundary math in getStats()) —
  // bucketing is hand-rolled the same way, and revenue is drawn from
  // SalesOrder.grandTotal/orderDate (the "central business document" per
  // that model's own schema comment), excluding CANCELLED orders.
  async getRevenue(
    period: RevenuePeriod,
    month?: number,
    year?: number,
    filters: Omit<SalesOrderFilterInput, 'month' | 'year'> = {},
  ): Promise<RevenuePoint[]> {
    const now = new Date();
    const targetYear = year ?? now.getFullYear();
    const targetMonth = month ?? now.getMonth() + 1; // 1-12, human-readable
    // Non-date filters only — this endpoint's own period/month/year above
    // already control the date range per bucketing mode.
    const extraWhere = this.buildSalesOrderWhere(filters, false);

    if (period === 'yearly') {
      const startYear = targetYear - 4;
      const orders = await this.prisma.salesOrder.findMany({
        where: {
          ...extraWhere,
          orderDate: { gte: new Date(startYear, 0, 1), lt: new Date(targetYear + 1, 0, 1) },
        },
        select: { orderDate: true, grandTotal: true },
      });
      const buckets = new Map<number, number>();
      for (let y = startYear; y <= targetYear; y++) buckets.set(y, 0);
      for (const order of orders) {
        const y = order.orderDate.getFullYear();
        buckets.set(y, (buckets.get(y) ?? 0) + order.grandTotal);
      }
      return Array.from(buckets.entries()).map(([y, value]) => ({
        label: String(y),
        value: Math.round(value * 100) / 100,
      }));
    }

    if (period === 'quarterly') {
      const orders = await this.prisma.salesOrder.findMany({
        where: {
          ...extraWhere,
          orderDate: { gte: new Date(targetYear, 0, 1), lt: new Date(targetYear + 1, 0, 1) },
        },
        select: { orderDate: true, grandTotal: true },
      });
      const buckets = [0, 0, 0, 0];
      for (const order of orders) {
        buckets[Math.floor(order.orderDate.getMonth() / 3)] += order.grandTotal;
      }
      return buckets.map((value, i) => ({
        label: `Q${i + 1} ${targetYear}`,
        value: Math.round(value * 100) / 100,
      }));
    }

    if (period === 'monthly') {
      const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const orders = await this.prisma.salesOrder.findMany({
        where: {
          ...extraWhere,
          orderDate: { gte: new Date(targetYear, 0, 1), lt: new Date(targetYear + 1, 0, 1) },
        },
        select: { orderDate: true, grandTotal: true },
      });
      const buckets = new Array(12).fill(0);
      for (const order of orders) buckets[order.orderDate.getMonth()] += order.grandTotal;
      return buckets.map((value, i) => ({
        label: MONTH_LABELS[i],
        value: Math.round(value * 100) / 100,
      }));
    }

    // weekly — within the given month/year, bucketed into 7-day windows
    // starting from the 1st (so "Week 1" is always days 1-7, not an
    // ISO/calendar week).
    const rangeStart = new Date(targetYear, targetMonth - 1, 1);
    const rangeEnd = new Date(targetYear, targetMonth, 1);
    const orders = await this.prisma.salesOrder.findMany({
      where: { ...extraWhere, orderDate: { gte: rangeStart, lt: rangeEnd } },
      select: { orderDate: true, grandTotal: true },
    });
    const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
    const weekCount = Math.ceil(daysInMonth / 7);
    const buckets = new Array(weekCount).fill(0);
    for (const order of orders) {
      const weekIndex = Math.min(weekCount - 1, Math.floor((order.orderDate.getDate() - 1) / 7));
      buckets[weekIndex] += order.grandTotal;
    }
    return buckets.map((value, i) => ({
      label: `Week ${i + 1}`,
      value: Math.round(value * 100) / 100,
    }));
  }

  // Additive: Dashboard Redesign — Sales Executive Performance (requirement
  // #5). See ExecutivePerformanceEntry's own comment for how the
  // name-string/User-FK mismatch is handled.
  async getExecutivePerformance(filters: SalesOrderFilterInput = {}): Promise<ExecutivePerformanceEntry[]> {
    const [orders, executiveUsers] = await Promise.all([
      this.prisma.salesOrder.findMany({
        where: this.buildSalesOrderWhere(filters, true),
        select: { createdBy: true, grandTotal: true },
      }),
      this.prisma.user.findMany({
        where: {
          isActive: true,
          roles: { some: { role: { name: { in: ['Sales Executive', 'Sales Manager'] } } } },
        },
        select: { id: true, name: true },
      }),
    ]);

    const closedLeads = await this.prisma.lead.findMany({
      where: {
        deletedAt: null,
        assignedToUserId: { in: executiveUsers.map((u) => u.id) },
        status: { in: ['WON', 'LOST'] },
      },
      select: { assignedToUserId: true, status: true },
    });

    const wonPercentByUserId = new Map<string, number>();
    for (const user of executiveUsers) {
      const leadsForUser = closedLeads.filter((l) => l.assignedToUserId === user.id);
      const won = leadsForUser.filter((l) => l.status === 'WON').length;
      wonPercentByUserId.set(
        user.id,
        leadsForUser.length === 0 ? 0 : Math.round((won / leadsForUser.length) * 1000) / 10,
      );
    }
    const wonPercentByName = new Map<string, number>();
    for (const user of executiveUsers) {
      wonPercentByName.set(user.name, wonPercentByUserId.get(user.id) ?? 0);
    }

    const byName = new Map<string, { revenue: number; orders: number }>();
    for (const order of orders) {
      const key = order.createdBy || 'Unknown';
      const entry = byName.get(key) ?? { revenue: 0, orders: 0 };
      entry.revenue += order.grandTotal;
      entry.orders += 1;
      byName.set(key, entry);
    }

    return Array.from(byName.entries())
      .map(([executive, { revenue, orders: orderCount }]) => ({
        executive,
        revenue: Math.round(revenue * 100) / 100,
        orders: orderCount,
        wonPercent: wonPercentByName.get(executive) ?? 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }

  // Additive: Dashboard Redesign — donut charts (requirement #3). Lead
  // Sources reuses the existing leadSourceSummary groupBy (see getStats());
  // this method covers the other three donuts.
  async getCharts(): Promise<DashboardCharts> {
    const [leadStatusGroups, quotationStatusGroups, jeoStatusGroups, materials] = await Promise.all([
      this.prisma.lead.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { _all: true } }),
      this.prisma.quotation.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { _all: true } }),
      this.prisma.jobExecutionOrder.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.material.findMany({
        where: { isActive: true },
        select: { currentStock: true, minimumStock: true, reorderLevel: true },
      }),
    ]);

    const QUOTATION_STATUS_LABELS: Record<string, string> = {
      DRAFT: 'Draft',
      READY: 'Ready',
      SENT: 'Sent',
      ACCEPTED: 'Accepted',
      REJECTED: 'Rejected',
      EXPIRED: 'Expired',
    };
    const quotationStatus: StatusBreakdownEntry[] = quotationStatusGroups.map((g) => ({
      label: QUOTATION_STATUS_LABELS[g.status] ?? g.status,
      count: g._count._all,
    }));

    const LEAD_STATUS_LABELS: Record<string, string> = {
      NEW: 'New',
      ASSIGNED: 'Assigned',
      CONTACTED: 'Contacted',
      SITE_VISIT: 'Site Visit',
      QUALIFIED: 'Qualified',
      QUOTATION_SENT: 'Quotation Sent',
      WON: 'Won',
      LOST: 'Lost',
    };
    const leadStatus: StatusBreakdownEntry[] = leadStatusGroups.map((g) => ({
      label: LEAD_STATUS_LABELS[g.status] ?? g.status,
      count: g._count._all,
    }));

    const jeoBuckets = { Pending: 0, 'In Production': 0, Ready: 0, Completed: 0 };
    for (const g of jeoStatusGroups) {
      if (g.status === 'PENDING') jeoBuckets.Pending += g._count._all;
      else if (g.status === 'READY_FOR_DISPATCH') jeoBuckets.Ready += g._count._all;
      else if (g.status === 'COMPLETED') jeoBuckets.Completed += g._count._all;
      else jeoBuckets['In Production'] += g._count._all; // MATERIAL_READY, ASSEMBLY_STARTED, QC
    }
    const productionStatus: StatusBreakdownEntry[] = Object.entries(jeoBuckets).map(([label, count]) => ({
      label,
      count,
    }));

    const inventoryBuckets = { Healthy: 0, 'Low Stock': 0, Critical: 0, 'Out of Stock': 0 };
    for (const m of materials) {
      if (m.currentStock <= 0) inventoryBuckets['Out of Stock'] += 1;
      else if (m.currentStock <= m.minimumStock) inventoryBuckets.Critical += 1;
      else if (m.currentStock <= m.reorderLevel) inventoryBuckets['Low Stock'] += 1;
      else inventoryBuckets.Healthy += 1;
    }
    const inventoryStatus: StatusBreakdownEntry[] = Object.entries(inventoryBuckets).map(([label, count]) => ({
      label,
      count,
    }));

    return { leadStatus, quotationStatus, productionStatus, inventoryStatus };
  }

  // Additive: Dashboard Redesign v2 — India Sales Map (requirements #1-4).
  // Grouped in memory by Customer.state (same convention as
  // salesByExecutive/getExecutivePerformance above) — orders whose
  // customer has no state yet are bucketed under "Unknown" rather than
  // dropped, so totals still reconcile with the Sales Orders list.
  async getSalesByState(filters: SalesOrderFilterInput = {}): Promise<StateSalesEntry[]> {
    const orders = await this.prisma.salesOrder.findMany({
      where: this.buildSalesOrderWhere(filters, true),
      select: { customerId: true, grandTotal: true, customer: { select: { state: true } } },
    });

    const byState = new Map<string, { revenue: number; orders: number; customerIds: Set<string> }>();
    for (const order of orders) {
      const key = order.customer.state || 'Unknown';
      const entry = byState.get(key) ?? { revenue: 0, orders: 0, customerIds: new Set<string>() };
      entry.revenue += order.grandTotal;
      entry.orders += 1;
      entry.customerIds.add(order.customerId);
      byState.set(key, entry);
    }

    return Array.from(byState.entries())
      .map(([state, entry]) => ({
        state,
        revenue: Math.round(entry.revenue * 100) / 100,
        orders: entry.orders,
        customers: entry.customerIds.size,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }

  // Additive: Dashboard Redesign v2 — Top Products (requirement #12).
  async getTopProducts(filters: SalesOrderFilterInput = {}, limit = 10): Promise<TopProductEntry[]> {
    const items = await this.prisma.salesOrderItem.findMany({
      where: { salesOrder: this.buildSalesOrderWhere(filters, true) },
      select: { productId: true, quantity: true, lineTotal: true, product: { select: { name: true } } },
    });

    const byProduct = new Map<string, { name: string; revenue: number; quantity: number }>();
    for (const item of items) {
      const entry = byProduct.get(item.productId) ?? { name: item.product.name, revenue: 0, quantity: 0 };
      entry.revenue += item.lineTotal;
      entry.quantity += item.quantity;
      byProduct.set(item.productId, entry);
    }

    return Array.from(byProduct.entries())
      .map(([productId, entry]) => ({
        productId,
        name: entry.name,
        revenue: Math.round(entry.revenue * 100) / 100,
        quantity: entry.quantity,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);
  }

  // Additive: Dashboard Redesign v2 — Recent Activities timeline
  // (requirement #10). Straight read of the existing AuditLog table.
  async getRecentActivities(limit = 20): Promise<RecentActivityEntry[]> {
    const rows = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, module: true, action: true, actorName: true, remarks: true, createdAt: true },
    });
    return rows;
  }

  // Additive: Dashboard Redesign v2 — Today's Follow-ups list (requirement
  // #11). Same open-lead/date-window definition as
  // getStats().todaysFollowUpsCount, just returning rows instead of a count.
  async getTodaysFollowUps(): Promise<TodaysFollowUpEntry[]> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    const leads = await this.prisma.lead.findMany({
      where: {
        deletedAt: null,
        status: { notIn: ['WON', 'LOST'] as LeadStatus[] },
        nextFollowUp: { gte: startOfToday, lt: startOfTomorrow },
      },
      orderBy: { nextFollowUp: 'asc' },
      select: {
        id: true,
        leadNumber: true,
        companyName: true,
        contactPerson: true,
        phone: true,
        nextFollowUp: true,
        assignedToUser: { select: { name: true } },
      },
    });

    return leads.map((lead) => ({
      id: lead.id,
      leadNumber: lead.leadNumber,
      companyName: lead.companyName,
      contactPerson: lead.contactPerson,
      phone: lead.phone,
      nextFollowUp: lead.nextFollowUp,
      assignedToName: lead.assignedToUser?.name ?? null,
    }));
  }
}
