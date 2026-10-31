import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SalesOrdersService } from '../../src/sales-orders/sales-orders.service';

const TOKEN = 'A'.repeat(32);
const ordered = new Date('2026-10-29T06:00:00Z');
const entered = new Date('2026-10-30T06:00:00Z');
const at = (day: number) => new Date(`2026-11-${String(day).padStart(2, '0')}T06:00:00Z`);
const statusChange = (from: string, to: string, createdAt: Date) => ({
  oldValue: { status: from },
  newValue: { status: to },
  createdAt,
});

function makeService(order: Record<string, unknown> | null, changes: unknown[] = []) {
  const prisma: any = {
    salesOrder: { findFirst: jest.fn().mockResolvedValue(order) },
    auditLog: { findMany: jest.fn().mockResolvedValue(changes) },
  };
  const svc = new SalesOrdersService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any);
  return { svc, prisma };
}

const order = (over: Record<string, unknown> = {}) => ({
  id: 'so1',
  salesOrderNumber: 'SO-0001',
  orderDate: ordered,
  deliveryDate: at(15),
  createdAt: entered,
  status: 'PRODUCTION_STARTED',
  ...over,
});

describe('Sales order public tracking', () => {
  it('shows only order number, dates and status steps', async () => {
    const { svc, prisma } = makeService(order(), [
      statusChange('DRAFT', 'CONFIRMED', at(1)),
      statusChange('CONFIRMED', 'PRODUCTION_STARTED', at(2)),
    ]);
    const view = await svc.getPublicTracking(TOKEN, '1.2.3.4');

    expect(Object.keys(view).sort()).toEqual(
      ['cancelledAt', 'deliveryDate', 'orderDate', 'salesOrderNumber', 'status', 'statusLabel', 'steps'].sort(),
    );
    expect(view).toMatchObject({
      salesOrderNumber: 'SO-0001', orderDate: ordered, status: 'PRODUCTION_STARTED', statusLabel: 'Production Started', cancelledAt: null,
    });
    expect(view.steps).toEqual([
      // When it was entered, not the editable orderDate.
      { status: 'DRAFT', label: 'Order Placed', done: true, at: entered },
      { status: 'CONFIRMED', label: 'Confirmed', done: true, at: at(1) },
      { status: 'PRODUCTION_STARTED', label: 'Production Started', done: true, at: at(2) },
      { status: 'READY_FOR_DISPATCH', label: 'Ready for Dispatch', done: false, at: null },
      { status: 'DISPATCHED', label: 'Dispatched', done: false, at: null },
      { status: 'COMPLETED', label: 'Completed', done: false, at: null },
    ]);
    // Never selects prices, addresses, items or the customer.
    expect(prisma.salesOrder.findFirst).toHaveBeenCalledWith({
      where: { trackingToken: TOKEN, deletedAt: null },
      select: { id: true, salesOrderNumber: true, orderDate: true, deliveryDate: true, status: true, createdAt: true },
    });
  });

  it('follows the real status even where the audit trail has no entry', async () => {
    const { svc } = makeService(order({ status: 'DISPATCHED' }), [statusChange('READY_FOR_DISPATCH', 'DISPATCHED', at(9))]);
    const view = await svc.getPublicTracking(TOKEN, 'ip');
    expect(view.steps.map((s) => [s.status, s.done, s.at])).toEqual([
      ['DRAFT', true, entered],
      ['CONFIRMED', true, null],
      ['PRODUCTION_STARTED', true, null],
      ['READY_FOR_DISPATCH', true, null],
      ['DISPATCHED', true, at(9)],
      ['COMPLETED', false, null],
    ]);
  });

  it('a cancelled order shows how far it got and when it was cancelled', async () => {
    const { svc } = makeService(order({ status: 'CANCELLED' }), [
      statusChange('DRAFT', 'CONFIRMED', at(1)),
      statusChange('CONFIRMED', 'CANCELLED', at(3)),
    ]);
    const view = await svc.getPublicTracking(TOKEN, 'ip');
    expect(view).toMatchObject({ statusLabel: 'Cancelled', cancelledAt: at(3) });
    expect(view.steps.filter((s) => s.done).map((s) => s.status)).toEqual(['DRAFT', 'CONFIRMED']);
  });

  it('a cancelled order with no audit trail falls back to "placed"', async () => {
    const { svc } = makeService(order({ status: 'CANCELLED' }));
    const view = await svc.getPublicTracking(TOKEN, 'ip');
    expect(view.cancelledAt).toBeNull();
    expect(view.steps.filter((s) => s.done).map((s) => s.status)).toEqual(['DRAFT']);
  });

  it('a draft order reads as "Order Placed", not "Draft"', async () => {
    const { svc } = makeService(order({ status: 'DRAFT' }));
    await expect(svc.getPublicTracking(TOKEN, 'ip')).resolves.toMatchObject({ statusLabel: 'Order Placed' });
  });

  it('an unknown or deleted order is not found', async () => {
    const { svc } = makeService(null);
    await expect(svc.getPublicTracking(TOKEN, 'ip')).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each(['short', 'A'.repeat(33), `${'A'.repeat(31)}/`, ''])('refuses a malformed token %p without a lookup', async (token) => {
    const { svc, prisma } = makeService(order());
    await expect(svc.getPublicTracking(token, 'ip')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.salesOrder.findFirst).not.toHaveBeenCalled();
  });

  it('rate-limits repeated requests from one client', async () => {
    const { svc } = makeService(order());
    for (let i = 0; i < 30; i++) await svc.getPublicTracking(TOKEN, 'ip-a');
    await expect(svc.getPublicTracking(TOKEN, 'ip-a')).rejects.toBeInstanceOf(BadRequestException);
    // Other clients are unaffected.
    await expect(svc.getPublicTracking(TOKEN, 'ip-b')).resolves.toBeDefined();
  });
});

describe('Sales order creation', () => {
  it('stores a tracking token and does not wait for the WhatsApp', async () => {
    const created = { id: 'so1', salesOrderNumber: 'SO-0001' };
    const prisma: any = {
      quotation: { findUnique: jest.fn().mockResolvedValue({ id: 'q1', status: 'ACCEPTED', customerId: 'c1', items: [] }) },
      salesOrder: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(created) },
    };
    const svc = new SalesOrdersService(
      prisma, {} as any, {} as any, { record: jest.fn().mockResolvedValue(undefined) } as any, {} as any, {} as any,
    );
    const s = svc as any;
    jest.spyOn(s, 'resolveItemsAgainstQuotation').mockReturnValue([]);
    jest.spyOn(s, 'computeTotals').mockReturnValue({ items: [] });
    jest.spyOn(s, 'freezeToQuotationTotalsIfUnmodified').mockReturnValue(undefined);
    jest.spyOn(s, 'generateSalesOrderNumber').mockResolvedValue('SO-0001');
    jest.spyOn(s, 'sendOrderConfirmationEmail').mockResolvedValue(undefined);
    // Never settles — proves create() doesn't wait for it.
    const notifySpy = jest.spyOn(s, 'notifyCustomerTrackingWhatsApp').mockReturnValue(new Promise(() => undefined));

    await expect(svc.create({ quotationId: 'q1', items: [] } as any, 'Asha')).resolves.toBe(created);
    expect(prisma.salesOrder.create.mock.calls[0][0].data.trackingToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(notifySpy).toHaveBeenCalledWith(created, 'SALES_ORDER_CREATED', 'Asha');
  });
});

describe('Send to Customer (send and resend)', () => {
  const salesOrder = {
    id: 'so1',
    salesOrderNumber: 'SO-0001',
    status: 'CONFIRMED',
    customer: { email: 'Ravi@Example.com', contactPerson: 'Ravi', phone: '9876543210' },
    quotation: { quotationNumber: 'Q-1' },
    items: [],
    grandTotal: 100,
    deliveryDate: null,
  };
  let mailer: { send: jest.Mock };
  let svc: SalesOrdersService;
  let notifySpy: jest.SpyInstance;

  beforeEach(() => {
    mailer = { send: jest.fn().mockResolvedValue({ status: 'SENT' }) };
    svc = new SalesOrdersService(
      {} as any,
      mailer as any,
      { render: jest.fn().mockResolvedValue(Buffer.from('pdf')) } as any,
      { record: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any,
      {} as any,
    );
    jest.spyOn(svc, 'findOne').mockResolvedValue(salesOrder as any);
    jest.spyOn(svc as any, 'toPdfInput').mockReturnValue({});
    // Never settles — proves the send doesn't wait for the WhatsApp.
    notifySpy = jest.spyOn(svc as any, 'notifyCustomerTrackingWhatsApp').mockReturnValue(new Promise(() => undefined));
  });

  it.each([
    ['the customer email (as the dialog sends it)', { recipientEmail: ' ravi@example.com ' }],
    ['no recipient override', {}],
  ])('emails and WhatsApps the customer for %s', async (_label, dto) => {
    await expect(svc.sendSalesOrder('so1', dto, 'Asha')).resolves.toMatchObject({ emailStatus: 'SENT' });
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(notifySpy).toHaveBeenCalledWith(salesOrder, 'SALES_ORDER_CREATED', 'Asha');
  });

  it('does not WhatsApp the customer for a copy emailed to someone else', async () => {
    await svc.sendSalesOrder('so1', { recipientEmail: 'accounts@other.com' }, 'Asha');
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(notifySpy).not.toHaveBeenCalled();
  });

  it('still WhatsApps when the customer has no email on file', async () => {
    jest.spyOn(svc, 'findOne').mockResolvedValue({ ...salesOrder, customer: { ...salesOrder.customer, email: null } } as any);
    await svc.sendSalesOrder('so1', { recipientEmail: 'ravi@example.com' }, 'Asha');
    expect(notifySpy).toHaveBeenCalledTimes(1);
  });

  it('does not send the WhatsApp if the email step fails', async () => {
    mailer.send.mockRejectedValue(new Error('smtp down'));
    await expect(svc.sendSalesOrder('so1', {}, 'Asha')).rejects.toThrow('smtp down');
    expect(notifySpy).not.toHaveBeenCalled();
  });
});
