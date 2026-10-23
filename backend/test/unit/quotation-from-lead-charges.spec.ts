import { QuotationsService } from '../../src/quotations/quotations.service';

// Installation / transportation captured on the Lead must carry into the
// quotation generated from it (unless the request overrides them).
function makeService(lead: any) {
  const prisma = {
    product: { findMany: jest.fn().mockResolvedValue([{ id: 'p1', price: 100000, technicalSpec: null }]) },
    quotation: { create: jest.fn().mockResolvedValue({ id: 'q1' }), findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
  };
  const leadsService = { getLeadForQuotationGeneration: jest.fn().mockResolvedValue(lead) };
  const svc: any = new QuotationsService(
    prisma as any, {} as any, {} as any, {} as any, {} as any,
    {} as any, {} as any, {} as any, leadsService as any, {} as any,
  );
  const totals = jest.fn().mockResolvedValue({
    subtotal: 0, gstPercent: 18, installationCharge: 0, transportationCharge: 0,
    transportScope: 'COMPANY_SCOPE', pricesIncludeChargesAndGst: false, gstAmount: 0, discount: 0,
    grandTotal: 0, items: [],
  });
  svc.computeTotals = totals;
  svc.generateQuotationNumber = jest.fn().mockResolvedValue('Q-1');
  return { svc, totals };
}

const baseLead = {
  products: [{ productId: 'p1', quantity: 2, unitPrice: 100000, remarks: null, color: null, colorCharge: 0 }],
  installationCharge: 48000,
  transportationCharge: 15000,
  customerTransport: false,
};

describe('Generate quotation from lead: charges carry forward', () => {
  it('passes the lead installation/transportation to computeTotals', async () => {
    const { svc, totals } = makeService(baseLead);
    await svc.create({ leadId: 'l1' }).catch(() => undefined);
    const args = totals.mock.calls[0];
    expect(args[2]).toBe(48000);
    expect(args[3]).toBe(15000);
    expect(args[4]).toBeUndefined();
  });

  it('uses CUSTOMER_SCOPE when the lead says the customer arranges transport', async () => {
    const { svc, totals } = makeService({ ...baseLead, transportationCharge: null, customerTransport: true });
    await svc.create({ leadId: 'l1' }).catch(() => undefined);
    expect(totals.mock.calls[0][4]).toBe('CUSTOMER_SCOPE');
  });

  it('request values win over the lead values', async () => {
    const { svc, totals } = makeService(baseLead);
    await svc.create({ leadId: 'l1', installationCharge: 8000, transportationCharge: 0 }).catch(() => undefined);
    expect(totals.mock.calls[0][2]).toBe(8000);
    expect(totals.mock.calls[0][3]).toBe(0);
  });

  it('leaves both undefined (auto defaults) when the lead has none', async () => {
    const { svc, totals } = makeService({ ...baseLead, installationCharge: null, transportationCharge: null });
    await svc.create({ leadId: 'l1' }).catch(() => undefined);
    expect(totals.mock.calls[0][2]).toBeUndefined();
    expect(totals.mock.calls[0][3]).toBeUndefined();
  });
});
