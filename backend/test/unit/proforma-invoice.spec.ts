import { BadRequestException, ConflictException } from '@nestjs/common';
import { ProformaInvoicesService } from '../../src/proforma-invoices/proforma-invoices.service';

function makeService() {
  const prisma: any = {
    proformaInvoice: { update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'pi1', ...data })) },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const approvals = { createRequest: jest.fn().mockResolvedValue({}) };
  const svc = new ProformaInvoicesService(
    prisma, {} as any, {} as any, audit as any, {} as any, approvals as any,
  );
  return { svc, prisma, approvals };
}

const invoice = (over: Record<string, unknown> = {}) => ({
  id: 'pi1', invoiceNumber: 'PI-1', salesOrderId: 's1', status: 'DRAFT',
  grandTotal: 100000, advanceReceived: 0,
  salesOrder: { status: 'CONFIRMED', grandTotal: 100000 },
  ...over,
});

describe('Proforma Invoice advance validation', () => {
  it('rejects an advance greater than the invoice Grand Total', async () => {
    const { svc, prisma, approvals } = makeService();
    jest.spyOn(svc, 'findOne').mockResolvedValue(invoice() as any);
    await expect(svc.updateAdvance('pi1', { advanceReceived: 100000.5 } as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.proformaInvoice.update).not.toHaveBeenCalled();
    // An over-limit amount must not even be queued for approval.
    expect(approvals.createRequest).not.toHaveBeenCalled();
  });

  it('records an advance at or above the 50% minimum and up to the Grand Total', async () => {
    const { svc, prisma } = makeService();
    jest.spyOn(svc, 'findOne').mockResolvedValue(invoice() as any);
    await svc.updateAdvance('pi1', { advanceReceived: 100000 } as any);
    expect(prisma.proformaInvoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ advanceReceived: 100000 }) }),
    );
  });

  it('raises an approval request instead of saving an advance below 50%', async () => {
    const { svc, prisma, approvals } = makeService();
    jest.spyOn(svc, 'findOne').mockResolvedValue(invoice() as any);
    await expect(svc.updateAdvance('pi1', { advanceReceived: 10000 } as any)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(approvals.createRequest).toHaveBeenCalledTimes(1);
    expect(prisma.proformaInvoice.update).not.toHaveBeenCalled();
  });

  it('refuses to record an advance once the Sales Order is cancelled', async () => {
    const { svc } = makeService();
    jest.spyOn(svc, 'findOne').mockResolvedValue(invoice({ salesOrder: { status: 'CANCELLED', grandTotal: 100000 } }) as any);
    await expect(svc.updateAdvance('pi1', { advanceReceived: 60000 } as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('Proforma Invoice cancelled status is final', () => {
  it.each(['DRAFT', 'SENT', 'EXPIRED'])('cannot move from CANCELLED to %s', async (next) => {
    const { svc, prisma } = makeService();
    jest.spyOn(svc, 'findOne').mockResolvedValue(invoice({ status: 'CANCELLED' }) as any);
    await expect(svc.updateStatus('pi1', { status: next } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.proformaInvoice.update).not.toHaveBeenCalled();
  });

  it('still allows a normal transition from a live status', async () => {
    const { svc, prisma } = makeService();
    jest.spyOn(svc, 'findOne').mockResolvedValue(invoice({ status: 'DRAFT' }) as any);
    await svc.updateStatus('pi1', { status: 'CANCELLED' } as any);
    expect(prisma.proformaInvoice.update).toHaveBeenCalled();
  });
});

describe('Proforma Invoice GST % on the PDF', () => {
  it('is 18% when GST is charged on items + charges and a discount is given', () => {
    const { svc } = makeService();
    const input = (svc as any).toPdfInput({
      invoiceNumber: 'PI-1', invoiceDate: new Date(),
      customer: { companyName: 'A', contactPerson: 'B', phone: '1', gstNumber: null, state: 'Telangana' },
      salesOrder: { billingAddress: 'x', items: [] },
      subtotal: 110000, discount: 8000, tax: 21600, grandTotal: 133600, advanceReceived: 0,
    });
    expect(input.taxPercent).toBe(18);
  });
});
