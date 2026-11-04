import { BadRequestException, ConflictException, ForbiddenException, ValidationPipe } from '@nestjs/common';
import { QuotationsService } from '../../src/quotations/quotations.service';
import { CreateQuotationDto } from '../../src/quotations/dto/create-quotation.dto';
import { UpdateQuotationDto } from '../../src/quotations/dto/update-quotation.dto';

// The seeded Approval Matrix (prisma/seed.ts): 0–5% Sales Executive,
// 5–10% Sales Manager, 10%+ Administrator.
const MATRIX = [
  { min: 0, max: 5, role: 'Sales Executive' },
  { min: 5, max: 10, role: 'Sales Manager' },
  { min: 10, max: Number.MAX_SAFE_INTEGER, role: 'Administrator' },
];
const SALES_EXEC = { id: 'u-se', name: 'Anirudh', roles: ['Sales Executive'] };
const SALES_MANAGER = { id: 'u-sm', name: 'Rajesh', roles: ['Sales Manager'] };
const ADMIN = { id: 'u-admin', name: 'Admin', roles: ['Administrator'] };

// One fan, list price 100000, minimum 80000; `price` sets the discount.
function quotation(price: number, overrides: Record<string, unknown> = {}) {
  return {
    id: 'q1',
    quotationNumber: 'Q-1',
    status: 'DRAFT',
    discount: 0,
    publicToken: null,
    leadId: null,
    lead: null,
    customer: { contactPerson: 'Ravi', email: 'ravi@example.com', companyName: 'Acme' },
    grandTotal: price,
    items: [{ productId: 'p1', unitPrice: price, product: { name: 'Fan', minPrice: 80000, standardPrice: 100000 } }],
    ...overrides,
  };
}

function setup(current: ReturnType<typeof quotation>) {
  let state = { ...current };
  const prisma: any = {
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    $queryRaw: jest.fn().mockResolvedValue([]),
    quotation: {
      findUnique: jest.fn(async () => state),
      create: jest.fn(async ({ data }: any) => ({ ...state, ...data })),
      update: jest.fn(async ({ data }: any) => {
        const { items, ...rest } = data;
        state = {
          ...state,
          ...rest,
          ...(items ? { items: items.create.map((i: any) => ({ ...i, product: state.items[0].product })) } : {}),
        };
        return state;
      }),
    },
    quotationItem: { deleteMany: jest.fn() },
    quotationApprovalRequest: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      create: jest.fn(async ({ data }: any) => ({ id: 'r1', ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const matrix = {
    resolveRequiredRole: jest.fn(async (_module: string, percent: number) => {
      const bracket = MATRIX.find((b) => percent >= b.min && percent < b.max) ?? MATRIX[MATRIX.length - 1];
      return { name: bracket.role };
    }),
  };
  const mailer = { send: jest.fn().mockResolvedValue({ status: 'SENT' }) };
  const pdf = { render: jest.fn().mockResolvedValue(Buffer.from('pdf')) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const leads = { recordQuotationSent: jest.fn(), recordQuotationGenerated: jest.fn() };
  const notifications = { notifyPermissionHolders: jest.fn(), notifyUsers: jest.fn() };
  const service = new QuotationsService(
    prisma, {} as any, {} as any, {} as any, matrix as any, mailer as any, pdf as any,
    audit as any, leads as any, {} as any, notifications as any,
  );
  // computeTotals needs product lookups; the gate tests only need it to
  // hand back the edited items.
  jest.spyOn(service as any, 'computeTotals').mockImplementation(async (items: any, gstPercent: any, _i, _t, _s, _p, discount: any) => ({
    subtotal: 0, gstPercent, installationCharge: 0, transportationCharge: 0, transportScope: null,
    pricesIncludeChargesAndGst: false, gstIncludedInPrices: false, gstAmount: 0, discount: discount ?? 0, grandTotal: 0,
    items,
  }));
  // The customer-facing snapshot isn't what these tests are about.
  jest.spyOn(service as any, 'buildOfferContentFromLive').mockReturnValue({});
  return { service, prisma, mailer, audit, state: () => state };
}

function pricingKeyOf(service: QuotationsService, q: ReturnType<typeof quotation>) {
  return (service as any).pricingKey(q);
}

describe('Quotation approvals: no status through create/edit', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });

  it.each([
    ['create', CreateQuotationDto],
    ['edit', UpdateQuotationDto],
  ] as const)('strips `status` from a %s request body', async (_label, metatype) => {
    const dto = await pipe.transform({ status: 'ACCEPTED', notes: 'n' }, { type: 'body', metatype });
    expect(dto).not.toHaveProperty('status');
    expect(dto.notes).toBe('n');
  });

  it('never writes a status on edit, even if one reaches the service', async () => {
    const { service, prisma } = setup(quotation(100000));
    await service.update('q1', { status: 'ACCEPTED', notes: 'x' } as any, SALES_EXEC);
    expect(prisma.quotation.update.mock.calls[0][0].data).not.toHaveProperty('status');
  });
});

describe('Quotation approvals: sending needs the pricing approved', () => {
  it.each([
    ['Sales Executive at list price', SALES_EXEC, 100000],
    ['Sales Executive within 5%', SALES_EXEC, 97000],
    ['Sales Manager within 5% (base bracket, despite naming Sales Executive)', SALES_MANAGER, 97000],
    ['Sales Manager at 7%', SALES_MANAGER, 93000],
    ['Administrator at 15%', ADMIN, 85000],
    ['Administrator below the minimum', ADMIN, 75000],
  ])('sends: %s', async (_label, actor, price) => {
    const { service, mailer } = setup(quotation(price));
    await expect(service.sendQuotation('q1', {}, actor)).resolves.toMatchObject({ status: 'SENT' });
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Sales Executive at 7%', SALES_EXEC, 93000, 'APPROVAL_REQUIRED'],
    ['Sales Manager at 15%', SALES_MANAGER, 85000, 'APPROVAL_REQUIRED'],
    ['Sales Manager below the minimum', SALES_MANAGER, 75000, 'PRICE_BELOW_MINIMUM'],
  ])('refuses: %s', async (_label, actor, price, code) => {
    const { service, mailer, prisma } = setup(quotation(price));
    const error = await service.sendQuotation('q1', {}, actor).catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toMatchObject({ code });
    expect(error.getResponse().message).toMatch(/Request approval before sending it\./);
    expect(mailer.send).not.toHaveBeenCalled();
    expect(prisma.quotation.update).not.toHaveBeenCalled();
  });

  it('sends once an approval covers exactly these prices — and not other prices', async () => {
    const q = quotation(93000);
    const { service, prisma, mailer } = setup(q);
    prisma.quotationApprovalRequest.findFirst.mockImplementation(async ({ where }: any) =>
      where.status === 'APPROVED' && where.pricingKey === pricingKeyOf(service, q) ? { id: 'r1' } : null,
    );
    await service.sendQuotation('q1', {}, SALES_EXEC);
    expect(mailer.send).toHaveBeenCalledTimes(1);

    const other = setup(quotation(90000));
    other.prisma.quotationApprovalRequest.findFirst.mockImplementation(async ({ where }: any) =>
      where.pricingKey === pricingKeyOf(service, q) ? { id: 'r1' } : null,
    );
    await expect(other.service.sendQuotation('q1', {}, SALES_EXEC)).rejects.toBeInstanceOf(BadRequestException);
    expect(other.mailer.send).not.toHaveBeenCalled();
  });
});

describe('Quotation approvals: re-pricing a quotation the customer can accept', () => {
  const sent = (price: number) => quotation(price, { status: 'SENT', publicToken: 'tok' });
  const edit = (price: number) => ({ items: [{ productId: 'p1', unitPrice: price, quantity: 1 }] });

  it('withdraws the link when the new prices need approval the editor lacks', async () => {
    const { service, audit, state } = setup(sent(100000));
    const result: any = await service.update('q1', edit(93000) as any, SALES_EXEC);
    expect(result.publicLinkWithdrawn).toBe(true);
    expect(state()).toMatchObject({ status: 'READY', publicToken: null, tokenExpiresAt: null });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'Status Changed', newValue: expect.objectContaining({ publicLinkInvalidated: true }) }),
    );
  });

  it('keeps the link when the editor may set those prices', async () => {
    const { service, state } = setup(sent(100000));
    const result: any = await service.update('q1', edit(93000) as any, SALES_MANAGER);
    expect(result.publicLinkWithdrawn).toBeUndefined();
    expect(state()).toMatchObject({ status: 'SENT', publicToken: 'tok' });
  });

  it('leaves drafts alone (the send gate covers them)', async () => {
    const { service, state } = setup(quotation(100000));
    await service.update('q1', edit(85000) as any, SALES_EXEC);
    expect(state().status).toBe('DRAFT');
  });
});

describe('Quotation approvals: requesting', () => {
  it('refuses for an accepted quotation', async () => {
    const { service } = setup(quotation(93000, { status: 'ACCEPTED' }));
    await expect(service.requestApproval('q1', {}, SALES_EXEC)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a send request the sender does not need', async () => {
    const { service } = setup(quotation(100000));
    await expect(service.requestApproval('q1', { purpose: 'SEND' }, SALES_EXEC)).rejects.toThrow(/no approval is needed/);
  });

  it('records the purpose and exact prices, under the quotation row lock', async () => {
    const q = quotation(93000);
    const { service, prisma } = setup(q);
    await service.requestApproval('q1', { purpose: 'SEND', reason: 'Volume order' }, SALES_EXEC);
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.quotationApprovalRequest.create.mock.calls[0][0].data).toMatchObject({
      purpose: 'SEND',
      pricingKey: pricingKeyOf(service, q),
      discountPercent: expect.closeTo(7, 5),
      belowMinPrice: false,
    });
  });

  it('refuses a second pending request', async () => {
    const { service, prisma } = setup(quotation(93000));
    prisma.quotationApprovalRequest.findFirst.mockResolvedValue({ id: 'r0' });
    await expect(service.requestApproval('q1', {}, SALES_EXEC)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.quotationApprovalRequest.create).not.toHaveBeenCalled();
  });
});

describe('Quotation approvals: deciding', () => {
  function request(service: QuotationsService, q: ReturnType<typeof quotation>, overrides: Record<string, unknown> = {}) {
    return {
      id: 'r1',
      quotationId: 'q1',
      status: 'PENDING',
      purpose: 'ACCEPT',
      discountPercent: 7,
      belowMinPrice: false,
      pricingKey: pricingKeyOf(service, q),
      requestedByUserId: 'u-se',
      quotation: { quotationNumber: 'Q-1' },
      ...overrides,
    };
  }

  it('approving an ACCEPT request claims it and accepts the quotation in one transaction', async () => {
    const q = quotation(93000, { status: 'SENT' });
    const { service, prisma, audit } = setup(q);
    prisma.quotationApprovalRequest.findUnique.mockResolvedValue(request(service, q));
    const result: any = await service.decideApprovalRequest('r1', { approve: true }, SALES_MANAGER);
    expect(result).toMatchObject({ status: 'APPROVED', purpose: 'ACCEPT' });
    expect(prisma.quotationApprovalRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'r1', status: 'PENDING' } }),
    );
    expect(prisma.quotation.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'ACCEPTED' } }));
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'Status Changed', oldValue: { status: 'SENT' }, newValue: { status: 'ACCEPTED' } }),
    );
  });

  it('approving a SEND request approves the pricing only', async () => {
    const q = quotation(93000);
    const { service, prisma } = setup(q);
    prisma.quotationApprovalRequest.findUnique.mockResolvedValue(request(service, q, { purpose: 'SEND' }));
    const result: any = await service.decideApprovalRequest('r1', { approve: true }, SALES_MANAGER);
    expect(result).toMatchObject({ status: 'APPROVED', purpose: 'SEND', quotation: null });
    expect(prisma.quotationApprovalRequest.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.quotation.update).not.toHaveBeenCalled();
  });

  it('refuses to approve prices changed after the request', async () => {
    const asked = quotation(93000);
    const { service, prisma } = setup(quotation(60000));
    prisma.quotationApprovalRequest.findUnique.mockResolvedValue(request(service, asked));
    await expect(service.decideApprovalRequest('r1', { approve: true }, ADMIN)).rejects.toThrow(/prices have changed/);
    expect(prisma.quotationApprovalRequest.updateMany).not.toHaveBeenCalled();
    expect(prisma.quotation.update).not.toHaveBeenCalled();
  });

  it('compares requests made before exact prices were recorded by their discount', async () => {
    const { service, prisma } = setup(quotation(60000));
    prisma.quotationApprovalRequest.findUnique.mockResolvedValue(
      request(service, quotation(93000), { pricingKey: null, discountPercent: 7 }),
    );
    await expect(service.decideApprovalRequest('r1', { approve: true }, ADMIN)).rejects.toThrow(/prices have changed/);
  });

  it('still lets the approver reject a request whose prices changed', async () => {
    const { service, prisma } = setup(quotation(60000));
    prisma.quotationApprovalRequest.findUnique.mockResolvedValue(request(service, quotation(93000)));
    await expect(service.decideApprovalRequest('r1', { approve: false }, ADMIN)).resolves.toEqual({ status: 'REJECTED' });
  });

  it('refuses to approve for an already-accepted quotation', async () => {
    const q = quotation(93000, { status: 'ACCEPTED' });
    const { service, prisma } = setup(q);
    prisma.quotationApprovalRequest.findUnique.mockResolvedValue(request(service, q));
    await expect(service.decideApprovalRequest('r1', { approve: true }, ADMIN)).rejects.toBeInstanceOf(ConflictException);
  });

  it('lets only one of two simultaneous decisions through', async () => {
    const q = quotation(93000);
    const { service, prisma } = setup(q);
    prisma.quotationApprovalRequest.findUnique.mockResolvedValue(request(service, q));
    prisma.quotationApprovalRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.decideApprovalRequest('r1', { approve: true }, SALES_MANAGER)).rejects.toThrow(/already been decided/);
    expect(prisma.quotation.update).not.toHaveBeenCalled();
  });

  it('tells the inbox who may decide each request, and says "Only an Administrator" plainly', async () => {
    const q = quotation(75000);
    const { service, prisma } = setup(q);
    prisma.quotationApprovalRequest.findMany = jest.fn().mockResolvedValue([
      request(service, q, { id: 'below-min', belowMinPrice: true, discountPercent: 25 }),
      request(service, q, { id: 'seven', discountPercent: 7 }),
      request(service, q, { id: 'seven-again', discountPercent: 7 }),
    ]);
    const list = await service.listApprovalRequests('PENDING');
    expect(list.map((r: any) => [r.id, r.requiredApprover])).toEqual([
      ['below-min', 'Administrator'],
      ['seven', 'Sales Manager'],
      ['seven-again', 'Sales Manager'],
    ]);

    prisma.quotationApprovalRequest.findUnique.mockResolvedValue(request(service, q, { belowMinPrice: true }));
    await expect(service.decideApprovalRequest('r1', { approve: false }, SALES_MANAGER)).rejects.toThrow(
      'Only an Administrator can decide this approval request',
    );
  });

  it('keeps the Approval Matrix role check', async () => {
    const q = quotation(85000);
    const { service, prisma } = setup(q);
    prisma.quotationApprovalRequest.findUnique.mockResolvedValue(request(service, q, { discountPercent: 15 }));
    await expect(service.decideApprovalRequest('r1', { approve: true }, SALES_MANAGER)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
