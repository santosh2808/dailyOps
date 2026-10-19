import { BadRequestException } from '@nestjs/common';
import { QuotationsService, MAX_DISCOUNT_PERCENT } from '../../src/quotations/quotations.service';

// QuotationsService.computeTotals() is private and only needs
// prisma.product.findMany, so the service is built with every dependency
// stubbed and the method is reached through an `any` cast.
function makeService() {
  const prisma = {
    product: {
      findMany: jest.fn().mockResolvedValue([{ id: 'p1', price: 100000, technicalSpec: null }]),
    },
  };
  const svc = new QuotationsService(
    prisma as any, {} as any, {} as any, {} as any, {} as any,
    {} as any, {} as any, {} as any, {} as any, {} as any,
  );
  const compute = (...args: unknown[]) => (svc as any).computeTotals(...args);
  return { compute };
}

const items = () => [{ productId: 'p1', quantity: 1, unitPrice: 100000 }];

describe('Quotation totals', () => {
  it('adds installation/transportation and keeps GST out of the grand total', async () => {
    const { compute } = makeService();
    const t = await compute(items(), 18, 10000, 0, undefined, false, 0);
    expect(t.subtotal).toBe(100000);
    expect(t.installationCharge).toBe(10000);
    // GST is computed on items + charges, quoted as "Extra", not summed in.
    expect(t.gstAmount).toBe(19800);
    expect(t.discount).toBe(0);
    expect(t.grandTotal).toBe(110000);
  });

  it('subtracts a discount from the pre-discount total without changing GST', async () => {
    const { compute } = makeService();
    const t = await compute(items(), 18, 10000, 0, undefined, false, 8000);
    expect(t.discount).toBe(8000);
    expect(t.gstAmount).toBe(19800);
    expect(t.grandTotal).toBe(102000);
  });
});

describe('Quotation discount limit', () => {
  it('is 10 percent', () => {
    expect(MAX_DISCOUNT_PERCENT).toBe(10);
  });

  it('accepts a discount of exactly 10% of the pre-discount total', async () => {
    const { compute } = makeService();
    const t = await compute(items(), 18, 10000, 0, undefined, false, 11000);
    expect(t.discount).toBe(11000);
    expect(t.grandTotal).toBe(99000);
  });

  it('rejects a discount above 10% of the pre-discount total', async () => {
    const { compute } = makeService();
    await expect(compute(items(), 18, 10000, 0, undefined, false, 11000.5)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('applies the same limit when prices already include charges and GST', async () => {
    const { compute } = makeService();
    await expect(compute(items(), 18, undefined, undefined, undefined, true, 10001)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const ok = await compute(items(), 18, undefined, undefined, undefined, true, 10000);
    expect(ok.discount).toBe(10000);
    expect(ok.grandTotal).toBe(90000);
  });

  it('treats a zero or omitted discount as no discount', async () => {
    const { compute } = makeService();
    expect((await compute(items(), 18, 0, 0, undefined, false)).discount).toBe(0);
    expect((await compute(items(), 18, 0, 0, undefined, false, 0)).discount).toBe(0);
  });
});

describe('Quotation: GST included in item price, installation extra', () => {
  it('charges GST only on installation/transportation, not on the items', async () => {
    const { compute } = makeService();
    // items 100000 (GST already inside) + installation 10000 + transport 0
    const t = await compute(items(), 18, 10000, 0, undefined, false, 0, true);
    expect(t.gstIncludedInPrices).toBe(true);
    expect(t.subtotal).toBe(100000);
    expect(t.installationCharge).toBe(10000);
    expect(t.gstAmount).toBe(1800); // 18% of 10000 only
    expect(t.grandTotal).toBe(110000); // GST on extras is added later, at Sales Order
  });

  it('with installation included (0) there is no extra GST at all', async () => {
    const { compute } = makeService();
    const t = await compute(items(), 18, 0, 0, undefined, false, 0, true);
    expect(t.gstAmount).toBe(0);
    expect(t.grandTotal).toBe(100000);
  });

  it('is unchanged when the flag is off', async () => {
    const { compute } = makeService();
    const t = await compute(items(), 18, 10000, 0, undefined, false, 0, false);
    expect(t.gstAmount).toBe(19800);
  });
});
