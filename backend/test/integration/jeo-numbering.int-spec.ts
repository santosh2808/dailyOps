import { PrismaClient } from '@prisma/client';
import { StateSeriesCodesService } from '../../src/state-series-codes/state-series-codes.service';
import { QuotationsService } from '../../src/quotations/quotations.service';

// Concurrency through Prisma against real Postgres: the row/table locks the
// unit tests can only assert are requested. This WRITES (and removes) rows,
// so it is stricter than schema.int-spec.ts: the database name itself must
// contain "test" — a developer's own database on localhost is never used.
const url = process.env.DATABASE_URL;
const dbName = url ? new URL(url).pathname.replace(/^\//, '') : '';
const describeDb = /test/i.test(dbName) ? describe : describe.skip;

describeDb('JEO numbering and approvals under concurrency (real database)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const NEW_STATES = ['Goa', 'Meghalaya', 'Sikkim', 'Tripura', 'Mizoram'];

  afterAll(async () => {
    await prisma.stateSeriesCode.deleteMany({ where: { state: { in: NEW_STATES } } });
    await prisma.$disconnect();
  });

  it('gives simultaneous first JEOs for different new states different series blocks', async () => {
    const service = new StateSeriesCodesService(prisma as any);
    await prisma.stateSeriesCode.deleteMany({ where: { state: { in: NEW_STATES } } });
    const before = await prisma.stateSeriesCode.aggregate({ _max: { seriesStart: true } });

    const results = await Promise.all(NEW_STATES.map((state) => service.seriesForState(state)));

    const starts = results.map((r) => r.seriesStart).sort((a, b) => a - b);
    expect(new Set(starts).size).toBe(NEW_STATES.length);
    const highest = before._max.seriesStart ?? 3000;
    expect(starts).toEqual(NEW_STATES.map((_, i) => highest + 1000 * (i + 1)));
  });

  it('creates one row when the same new state is asked for simultaneously', async () => {
    const service = new StateSeriesCodesService(prisma as any);
    await prisma.stateSeriesCode.deleteMany({ where: { state: 'Goa' } });
    const results = await Promise.all(Array.from({ length: 6 }, () => service.seriesForState('Goa')));
    expect(new Set(results.map((r) => r.seriesStart)).size).toBe(1);
    expect(await prisma.stateSeriesCode.count({ where: { state: 'Goa' } })).toBe(1);
  });

  it('lets only one of two simultaneous approval requests for a quotation through', async () => {
    const customer = await prisma.customer.create({ data: { companyName: 'Concurrency Test Co', contactPerson: 'T', phone: `9${String(Date.now()).slice(-9)}` } });
    const quotation = await prisma.quotation.create({
      data: { quotationNumber: `INT-TEST-${Date.now()}`, customerId: customer.id },
      include: { items: { include: { product: true } }, customer: true, lead: true },
    });
    try {
      const service = new QuotationsService(
        prisma as any, {} as any, {} as any, {} as any,
        { resolveRequiredRole: async () => null } as any, {} as any, {} as any,
        { record: async () => undefined } as any, {} as any, {} as any,
        { notifyPermissionHolders: async () => undefined } as any,
      );
      const outcomes = await Promise.allSettled([
        service.requestApproval(quotation.id, {}, { name: 'A' }),
        service.requestApproval(quotation.id, {}, { name: 'B' }),
      ]);
      expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
      expect(await prisma.quotationApprovalRequest.count({ where: { quotationId: quotation.id, status: 'PENDING' } })).toBe(1);
    } finally {
      await prisma.quotationApprovalRequest.deleteMany({ where: { quotationId: quotation.id } });
      await prisma.quotation.delete({ where: { id: quotation.id } });
      await prisma.customer.delete({ where: { id: customer.id } });
    }
  });
});
