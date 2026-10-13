import { QuotationsService } from '../../src/quotations/quotations.service';

describe('Quotation acceptance', () => {
  it('only marks the quotation ACCEPTED — it never creates a Sales Order, Proforma Invoice or JEO', async () => {
    const prisma = {
      quotation: { update: jest.fn().mockResolvedValue({ id: 'q1', status: 'ACCEPTED' }) },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const salesOrders = { create: jest.fn(), createFromQuotation: jest.fn() };
    const invoices = { create: jest.fn(), createFromSalesOrder: jest.fn() };
    const jeos = { create: jest.fn(), createFromSalesOrder: jest.fn() };

    const svc = new QuotationsService(
      prisma as any, salesOrders as any, invoices as any, jeos as any, {} as any,
      {} as any, {} as any, audit as any, {} as any, {} as any,
    );

    const result = await (svc as any).performAccept('q1', 'Tester');

    expect(prisma.quotation.update).toHaveBeenCalledTimes(1);
    expect(prisma.quotation.update.mock.calls[0][0].data).toEqual({ status: 'ACCEPTED' });
    expect(result.quotation.status).toBe('ACCEPTED');
    expect(result.salesOrder).toBeNull();
    for (const fn of Object.values({ ...salesOrders, ...invoices, ...jeos })) {
      expect(fn).not.toHaveBeenCalled();
    }
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ module: 'Quotation', action: 'Status Changed' }));
  });
});
