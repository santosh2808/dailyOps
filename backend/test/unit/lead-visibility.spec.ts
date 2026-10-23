import { ExecutionContext, NotFoundException } from '@nestjs/common';
import {
  LeadVisibilityGuard,
  QuotationVisibilityGuard,
  SalesOrderVisibilityGuard,
  canViewAllLeads,
  leadVisibilityWhere,
  quotationVisibilityWhere,
  salesOrderVisibilityWhere,
} from '../../src/leads/lead-visibility';
import { LeadsService } from '../../src/leads/leads.service';
import { QuotationsService } from '../../src/quotations/quotations.service';
import { SalesOrdersService } from '../../src/sales-orders/sales-orders.service';
import { DashboardService } from '../../src/dashboard/dashboard.service';

// "Only assigned leads are visible to that person": Administrator, Sales
// Manager, Telecaller and Digital Marketing see every lead (assigned or not);
// everyone else (Sales Executive, ...) sees only leads assigned to them.

const exec = { id: 'u-exec', roles: ['Sales Executive'] };
const json = (v: unknown) => JSON.stringify(v);

describe('canViewAllLeads', () => {
  it.each([
    ['Administrator'],
    ['Sales Manager'],
    ['Telecaller'],
    ['Telecallers'],
    ['telecaller'],
    ['Digital Marketing'],
    ['Digital Marketer'],
    ['digital-marketing'],
  ])('%s sees all leads', (role) => {
    expect(canViewAllLeads({ id: 'x', roles: [role] })).toBe(true);
  });

  it('a Sales Executive still carrying the default legacy role "admin" is restricted', () => {
    expect(canViewAllLeads({ id: 'x', role: 'admin', roles: ['Sales Executive'] })).toBe(false);
    expect(canViewAllLeads({ id: 'x', role: 'admin', roles: ['Sales Executive', 'Telecaller'] })).toBe(true);
  });

  it('legacy admin user.role sees all leads', () => {
    expect(canViewAllLeads({ id: 'x', role: 'admin', roles: [] })).toBe(true);
  });

  it('Sales Executive, other roles and role-less users are restricted', () => {
    expect(canViewAllLeads(exec)).toBe(false);
    expect(canViewAllLeads({ id: 'x', roles: ['Production'] })).toBe(false);
    expect(canViewAllLeads({ id: 'x', roles: [] })).toBe(false);
  });

  it('one full-visibility role among several is enough', () => {
    expect(canViewAllLeads({ id: 'x', roles: ['Sales Executive', 'Telecaller'] })).toBe(true);
  });

  it('no viewer (internal/system caller) is unrestricted', () => {
    expect(canViewAllLeads(undefined)).toBe(true);
  });
});

describe('visibility where-clauses', () => {
  it('restricted user: leads limited to own assignment, unassigned excluded', () => {
    expect(leadVisibilityWhere(exec)).toEqual({ assignedToUserId: 'u-exec' });
  });
  it('full-visibility user: no restriction (unassigned leads included)', () => {
    expect(leadVisibilityWhere({ id: 'm', roles: ['Sales Manager'] })).toEqual({});
    expect(quotationVisibilityWhere({ id: 'm', roles: ['Sales Manager'] })).toEqual({});
    expect(salesOrderVisibilityWhere({ id: 'm', roles: ['Sales Manager'] })).toEqual({});
  });
  it('restricted user without an id matches nothing', () => {
    expect(leadVisibilityWhere({ roles: ['Sales Executive'] })).toEqual({ assignedToUserId: '__none__' });
  });
  it('quotations/sales orders: own leads or lead-less only', () => {
    expect(quotationVisibilityWhere(exec)).toEqual({
      OR: [{ leadId: null }, { lead: { assignedToUserId: 'u-exec' } }],
    });
    expect(salesOrderVisibilityWhere(exec)).toEqual({ quotation: quotationVisibilityWhere(exec) });
  });
});

describe('route guards', () => {
  const ctx = (user: any, id?: string) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user, params: id ? { id } : {} }) }) }) as unknown as ExecutionContext;

  it('lead: restricted user gets 404 for someone else\'s lead, ok for own', async () => {
    const count = jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    const guard = new LeadVisibilityGuard({ lead: { count } } as any);
    await expect(guard.canActivate(ctx(exec, 'lead-1'))).rejects.toBeInstanceOf(NotFoundException);
    expect(count).toHaveBeenCalledWith({ where: { id: 'lead-1', assignedToUserId: 'u-exec' } });
    await expect(guard.canActivate(ctx(exec, 'lead-2'))).resolves.toBe(true);
  });

  it('lead: full-visibility user never hits the database; id-less routes pass', async () => {
    const count = jest.fn();
    const guard = new LeadVisibilityGuard({ lead: { count } } as any);
    await expect(guard.canActivate(ctx({ id: 'm', roles: ['Telecaller'] }, 'lead-1'))).resolves.toBe(true);
    await expect(guard.canActivate(ctx(exec))).resolves.toBe(true);
    expect(count).not.toHaveBeenCalled();
  });

  it('quotation / sales order guards 404 hidden records', async () => {
    const q = new QuotationVisibilityGuard({ quotation: { count: jest.fn().mockResolvedValue(0) } } as any);
    await expect(q.canActivate(ctx(exec, 'q1'))).rejects.toThrow('Quotation not found');
    const s = new SalesOrderVisibilityGuard({ salesOrder: { count: jest.fn().mockResolvedValue(0) } } as any);
    await expect(s.canActivate(ctx(exec, 's1'))).rejects.toThrow('Sales order not found');
  });
});

describe('services apply the scope', () => {
  it('LeadsService.findAll restricts the query for a Sales Executive only', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const svc = new (LeadsService as any)({ lead: { findMany, count } });

    await svc.findAll({ search: 'abc', assignedToUserId: 'someone-else' }, exec);
    const where = findMany.mock.calls[0][0].where;
    // Own-assignment rule sits in AND, so the explicit filter can't override it.
    expect(where.AND).toEqual([{ assignedToUserId: 'u-exec' }]);

    findMany.mockClear();
    await svc.findAll({}, { id: 'tc', roles: ['Telecaller'] });
    expect(findMany.mock.calls[0][0].where.AND).toEqual([{}]);
  });

  it('LeadsService.exportLeadsToExcel exports only own leads for a Sales Executive', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const svc = new (LeadsService as any)({ lead: { findMany } });
    await svc.exportLeadsToExcel(exec);
    expect(findMany.mock.calls[0][0].where).toEqual({ deletedAt: null, assignedToUserId: 'u-exec' });
    await svc.exportLeadsToExcel({ id: 'a', roles: ['Administrator'] });
    expect(findMany.mock.calls[1][0].where).toEqual({ deletedAt: null });
  });

  it('assertLeadVisible (generate-quotation path) rejects another user\'s lead', async () => {
    const count = jest.fn().mockResolvedValue(0);
    const svc = new (LeadsService as any)({ lead: { count } });
    await expect(svc.getLeadForQuotationGeneration('l1', exec)).rejects.toBeInstanceOf(NotFoundException);
    // Internal callers (no viewer) are unaffected.
    await expect(svc.assertLeadVisible('l1', undefined)).resolves.toBeUndefined();
  });

  it('QuotationsService.findAll / SalesOrdersService.findAll scope by lead assignment', async () => {
    const qFind = jest.fn().mockResolvedValue([]);
    const qSvc = new (QuotationsService as any)({ quotation: { findMany: qFind, count: jest.fn().mockResolvedValue(0) } });
    await qSvc.findAll({}, exec);
    expect(qFind.mock.calls[0][0].where.AND).toEqual([quotationVisibilityWhere(exec)]);

    const sFind = jest.fn().mockResolvedValue([]);
    const sSvc = new (SalesOrdersService as any)({ salesOrder: { findMany: sFind, count: jest.fn().mockResolvedValue(0) } });
    await sSvc.findAll({}, exec);
    expect(sFind.mock.calls[0][0].where.AND).toEqual([salesOrderVisibilityWhere(exec)]);
  });
});

describe('dashboard lead numbers', () => {
  function prismaStub() {
    const calls: Record<string, any[]> = {};
    const model = (n: string) => ({
      count: jest.fn((a: any) => ((calls[`${n}.count`] ||= []).push(a), Promise.resolve(0))),
      findMany: jest.fn((a: any) => ((calls[`${n}.findMany`] ||= []).push(a), Promise.resolve([]))),
      groupBy: jest.fn((a: any) => ((calls[`${n}.groupBy`] ||= []).push(a), Promise.resolve([]))),
    });
    const prisma: any = {};
    for (const n of [
      'customer', 'product', 'lead', 'quotation', 'salesOrder', 'proformaInvoice', 'jobExecutionOrder',
      'material', 'supplier', 'quotationApprovalRequest', 'complaint', 'user',
    ]) prisma[n] = model(n);
    return { prisma, calls };
  }

  it('stats, charts, funnel and today\'s follow-ups only count the user\'s own leads', async () => {
    const { prisma, calls } = prismaStub();
    const svc = new DashboardService(prisma);
    const scope = { assignedToUserId: 'u-exec' };
    await svc.getStats(scope);
    await svc.getCharts(scope);
    await svc.getTodaysFollowUps(scope);
    await svc.getFunnel(undefined, 'u-exec');
    const leadCalls = [...calls['lead.count'], ...calls['lead.groupBy'], ...calls['lead.findMany']];
    expect(leadCalls.length).toBeGreaterThan(5);
    for (const args of leadCalls) expect(json(args.where)).toContain('"assignedToUserId":"u-exec"');
  });

  it('unrestricted scope adds no assignment filter', async () => {
    const { prisma, calls } = prismaStub();
    await new DashboardService(prisma).getStats({});
    for (const args of calls['lead.count']) expect(json(args.where)).not.toContain('assignedToUserId');
  });
});
