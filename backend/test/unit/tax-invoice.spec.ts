import { BadRequestException } from '@nestjs/common';
import { TaxInvoicesService } from '../../src/tax-invoices/tax-invoices.service';

describe('Tax Invoice cancelled status is final', () => {
  const make = (status: string) => {
    const prisma: any = {
      taxInvoice: { update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 't1', ...data })) },
    };
    const svc = new TaxInvoicesService(prisma, {} as any, {} as any, { record: jest.fn().mockResolvedValue(undefined) } as any, {} as any);
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 't1', status } as any);
    return { svc, prisma };
  };

  it.each(['DRAFT', 'SENT'])('cannot move from CANCELLED to %s', async (next) => {
    const { svc, prisma } = make('CANCELLED');
    await expect(svc.updateStatus('t1', { status: next } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.taxInvoice.update).not.toHaveBeenCalled();
  });

  it('allows cancelling a live invoice', async () => {
    const { svc, prisma } = make('SENT');
    await svc.updateStatus('t1', { status: 'CANCELLED' } as any);
    expect(prisma.taxInvoice.update).toHaveBeenCalled();
  });
});
