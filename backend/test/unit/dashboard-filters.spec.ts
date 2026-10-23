import { DashboardService } from '../../src/dashboard/dashboard.service';

// Regression: Year / Month / Source global filters must reach every
// widget that has a date-of-record / lead-source relationship, not just the Map.
function makePrisma() {
  const calls: Record<string, any[]> = {};
  const rec = (model: string, fn: string, ret: any) =>
    jest.fn((args: any) => {
      (calls[`${model}.${fn}`] ||= []).push(args);
      return Promise.resolve(ret);
    });
  const model = (name: string) => ({
    count: rec(name, 'count', 0),
    findMany: rec(name, 'findMany', []),
    groupBy: rec(name, 'groupBy', []),
  });
  const prisma: any = {
    customer: model('customer'),
    product: model('product'),
    lead: model('lead'),
    quotation: model('quotation'),
    salesOrder: model('salesOrder'),
    proformaInvoice: model('proformaInvoice'),
    jobExecutionOrder: model('jobExecutionOrder'),
    material: model('material'),
    supplier: model('supplier'),
    quotationApprovalRequest: model('quotationApprovalRequest'),
    complaint: model('complaint'),
    user: model('user'),
  };
  return { prisma, calls };
}

const scope = { year: 2026, month: 8, leadSource: 'WEBSITE' as any };
const AUG1 = new Date(2026, 7, 1).toISOString();
const json = (v: unknown) => JSON.stringify(v);

describe('Dashboard global filters', () => {
  it('getStats applies year/month/source to every date/source-bearing count', async () => {
    const { prisma, calls } = makePrisma();
    await new DashboardService(prisma).getStats(scope);
    for (const key of ['lead.count', 'quotation.count', 'salesOrder.count', 'proformaInvoice.count', 'jobExecutionOrder.count', 'lead.groupBy', 'complaint.count']) {
      for (const args of calls[key]) {
        const w = json(args.where);
        // Follow-up counts are "as of today", so only source/state narrow them.
        if (!w.includes('nextFollowUp')) expect(w).toContain(AUG1);
        expect(w).toContain('WEBSITE');
      }
    }
    // Inventory / master data has no date or source: intentionally unfiltered.
    expect(json(calls['material.count'][0].where)).not.toContain('WEBSITE');
  });

  it('getCharts applies the filters to lead/quotation/production breakdowns', async () => {
    const { prisma, calls } = makePrisma();
    await new DashboardService(prisma).getCharts(scope);
    for (const key of ['lead.groupBy', 'quotation.groupBy', 'jobExecutionOrder.groupBy']) {
      const w = json(calls[key][0].where);
      expect(w).toContain(AUG1);
      expect(w).toContain('WEBSITE');
    }
  });

  it('executive performance scopes orders and Won % to the filters', async () => {
    const { prisma, calls } = makePrisma();
    await new DashboardService(prisma).getExecutivePerformance(scope);
    expect(json(calls['salesOrder.findMany'][0].where)).toContain('WEBSITE');
    expect(json(calls['lead.findMany'][0].where)).toContain('WEBSITE');
    expect(json(calls['lead.findMany'][0].where)).toContain(AUG1);
  });
});
