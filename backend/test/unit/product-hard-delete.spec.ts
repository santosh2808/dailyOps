import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProductsService } from '../../src/products/products.service';

type Usage = Partial<Record<'leads' | 'quotations' | 'salesOrders' | 'taxInvoices' | 'formProducts' | 'formRoutes', number>>;

function setup(usage: Usage = {}, product: Record<string, unknown> | null = { id: 'p1', name: 'Fan X' }) {
  const rows = (n = 0) => Array.from({ length: n }, (_, i) => ({ id: i }));
  const tx: any = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'p1' }]),
    leadProduct: { findMany: jest.fn().mockResolvedValue(rows(usage.leads)) },
    quotationItem: { findMany: jest.fn().mockResolvedValue(rows(usage.quotations)) },
    salesOrderItem: { findMany: jest.fn().mockResolvedValue(rows(usage.salesOrders)) },
    taxInvoiceItem: { findMany: jest.fn().mockResolvedValue(rows(usage.taxInvoices)) },
    formWebsiteProduct: { count: jest.fn().mockResolvedValue(usage.formProducts ?? 0) },
    formSubjectRoute: { count: jest.fn().mockResolvedValue(usage.formRoutes ?? 0) },
    product: { delete: jest.fn().mockResolvedValue({ id: 'p1' }) },
  };
  const prisma: any = {
    product: { findUnique: jest.fn().mockResolvedValue(product), update: jest.fn() },
    $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
  };
  return { svc: new ProductsService(prisma), prisma, tx };
}

describe('ProductsService.hardDelete', () => {
  it('permanently deletes an unused product, after locking its row', async () => {
    const { svc, tx } = setup();
    await expect(svc.hardDelete('p1')).resolves.toEqual({ id: 'p1' });
    expect(tx.product.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.leadProduct.findMany.mock.invocationCallOrder[0]);
  });

  it('returns 404 (not a 500) when someone else deleted it first', async () => {
    const { svc, tx } = setup();
    tx.$queryRaw.mockResolvedValue([]);
    await expect(svc.hardDelete('p1')).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.product.delete).not.toHaveBeenCalled();
  });

  it('refuses, with the reason, for a product used in business records — and deletes nothing', async () => {
    const { svc, tx } = setup({ leads: 1, quotations: 2, taxInvoices: 1 });
    const error = await svc.hardDelete('p1').catch((e) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.message).toBe(
      '"Fan X" can\'t be permanently deleted because it is used in 1 lead, 2 quotations, 1 tax invoice. ' +
        'Deactivate it instead to hide it from new records.',
    );
    expect(tx.product.delete).not.toHaveBeenCalled();
  });

  it('also refuses for website form product mappings and routing rules', async () => {
    const { svc, tx } = setup({ formRoutes: 1 });
    await expect(svc.hardDelete('p1')).rejects.toThrow('used in 1 website form routing rule');
    const both = setup({ formProducts: 2, salesOrders: 1 });
    await expect(both.svc.hardDelete('p1')).rejects.toThrow('used in 1 sales order, 2 website form product mappings');
    expect(tx.product.delete).not.toHaveBeenCalled();
  });

  it('turns a database foreign-key refusal into the same clear 409', async () => {
    const { svc, tx } = setup();
    tx.product.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('FK violation', { code: 'P2003', clientVersion: 'test' }),
    );
    await expect(svc.hardDelete('p1')).rejects.toThrow(
      '"Fan X" can\'t be permanently deleted because other records still use it.',
    );
  });

  it('returns 404 for an unknown product', async () => {
    const { svc } = setup({}, null);
    await expect(svc.hardDelete('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('leaves deactivate (the existing Deactivate button) as a soft update', async () => {
    const { svc, prisma, tx } = setup();
    await svc.deactivate('p1');
    expect(prisma.product.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { isActive: false } });
    expect(tx.product.delete).not.toHaveBeenCalled();
  });
});
