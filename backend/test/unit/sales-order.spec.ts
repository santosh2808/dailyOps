import { BadRequestException } from '@nestjs/common';
import { SalesOrdersService } from '../../src/sales-orders/sales-orders.service';

function makeService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma: any = { ...prismaOverrides };
  const svc = new SalesOrdersService(
    prisma, {} as any, {} as any, { record: jest.fn().mockResolvedValue(undefined) } as any, {} as any, {} as any,
  );
  return { svc, prisma };
}

// A quotation: items 1,10,000 + installation/transportation 10,000, discount 8,000.
// GST 18% on 1,20,000 = 21,600; quotation grand total (GST not included) = 1,12,000.
const quotation = (over: Record<string, unknown> = {}) => ({
  subtotal: 110000,
  gstAmount: 21600,
  grandTotal: 112000,
  installationCharge: 7000,
  transportationCharge: 3000,
  pricesIncludeChargesAndGst: false,
  discount: 8000,
  items: [{ productId: 'p1', quantity: 1, lineTotal: 110000 }],
  ...over,
});
const blankTotals = () => ({
  subtotal: 0, tax: 0, grandTotal: 0, installationCharge: 0, transportationCharge: 0, discount: 0,
  items: [{ productId: 'p1', quantity: 1, unitPrice: 0, lineTotal: 0, tax: 0 }],
});
const raw = [{ productId: 'p1', quantity: 1 }];

describe('Sales Order totals carried from the accepted quotation', () => {
  it('retains subtotal, charges, discount, GST and grand total exactly', () => {
    const { svc } = makeService();
    const totals: any = blankTotals();
    (svc as any).freezeToQuotationTotalsIfUnmodified(totals, raw, quotation());
    expect(totals.subtotal).toBe(110000);
    expect(totals.installationCharge).toBe(7000);
    expect(totals.transportationCharge).toBe(3000);
    expect(totals.discount).toBe(8000);
    expect(totals.tax).toBe(21600);
    // 1,12,000 (discounted, GST-less) + 21,600 GST = 1,33,600
    expect(totals.grandTotal).toBe(133600);
  });

  it('does not add GST a second time when the quotation price already included it', () => {
    const { svc } = makeService();
    const totals: any = blankTotals();
    (svc as any).freezeToQuotationTotalsIfUnmodified(
      totals, raw, quotation({ pricesIncludeChargesAndGst: true, grandTotal: 100000, gstAmount: 15254.24, discount: 0 }),
    );
    expect(totals.grandTotal).toBe(100000);
  });

  it('leaves totals untouched when the order items differ from the quotation', () => {
    const { svc } = makeService();
    const totals: any = blankTotals();
    (svc as any).freezeToQuotationTotalsIfUnmodified(totals, [{ productId: 'p1', quantity: 2 }], quotation());
    expect(totals.grandTotal).toBe(0);
    expect(totals.discount).toBe(0);
  });

  it('derives 18% (not more) for the GST % shown on the PDF', () => {
    const { svc } = makeService();
    const input = (svc as any).toPdfInput({
      salesOrderNumber: 'SO-1', orderDate: new Date(), deliveryDate: null, status: 'CONFIRMED',
      quotation: { quotationNumber: 'Q-1' },
      customer: { companyName: 'A', contactPerson: 'B', phone: '1', email: 'a@b.c', gstNumber: null, state: 'Telangana' },
      items: [], subtotal: 110000, installationCharge: 7000, transportationCharge: 3000,
      tax: 21600, discount: 8000, grandTotal: 133600,
    });
    expect(input.taxPercent).toBe(18);
  });
});

describe('Sales Order editing', () => {
  it.each(['CONFIRMED', 'CANCELLED'])('refuses to edit a %s order', async (status) => {
    const { svc } = makeService();
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 's1', status } as any);
    await expect(svc.update('s1', { remarks: 'x' } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('syncs every non-cancelled Proforma Invoice to the new totals', async () => {
    const updatedSalesOrder = { id: 's1', subtotal: 200, discount: 0, tax: 36, grandTotal: 236 };
    const tx = {
      salesOrderItem: { update: jest.fn().mockResolvedValue({}) },
      salesOrder: { update: jest.fn().mockResolvedValue(updatedSalesOrder) },
      proformaInvoice: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const { svc, prisma } = makeService({
      quotation: { findUnique: jest.fn().mockResolvedValue({ items: [] }) },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
    });
    jest.spyOn(svc, 'findOne').mockResolvedValue({
      id: 's1', status: 'DRAFT', quotationId: 'q1',
      items: [{ id: 'i1', productId: 'p1', description: null, quantity: 2, unitPrice: 100 }],
    } as any);

    await svc.update('s1', { gstPercent: 18 } as any);

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(tx.proformaInvoice.updateMany).toHaveBeenCalledWith({
      where: { salesOrderId: 's1', status: { not: 'CANCELLED' } },
      data: { subtotal: 200, discount: 0, tax: 36, grandTotal: 236 },
    });
  });

  it('does not touch invoices when the edit does not change items or GST', async () => {
    const tx = {
      salesOrder: { update: jest.fn().mockResolvedValue({ id: 's1' }) },
      proformaInvoice: { updateMany: jest.fn() },
    };
    const { svc } = makeService({ $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)) });
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 's1', status: 'DRAFT', quotationId: 'q1', items: [] } as any);
    await svc.update('s1', { remarks: 'only a note' } as any);
    expect(tx.proformaInvoice.updateMany).not.toHaveBeenCalled();
  });
});
