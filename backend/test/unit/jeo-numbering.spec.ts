import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { jeoDisplayNumber, jeoPdfFilename } from '../../src/common/jeo-number';
import {
  createJeoPdfLinkToken,
  JEO_PDF_LINK_TTL_MS,
  verifyJeoPdfLinkToken,
} from '../../src/job-execution-orders/jeo-pdf-link';
import { JobExecutionOrdersService } from '../../src/job-execution-orders/job-execution-orders.service';
import { StateSeriesCodesService } from '../../src/state-series-codes/state-series-codes.service';

describe('JEO number display', () => {
  it.each([
    ['JEO-2026-4004', '4004'],
    ['JEO-2026-10004', '10004'],
    ['JEO-2026-4004-2', '4004-2'],
    // Historical numbers stay as they were.
    ['JEO-2026-000004', 'JEO-2026-000004'],
    ['4008', '4008'],
  ])('%s is shown as %s', (stored, shown) => {
    expect(jeoDisplayNumber(stored)).toBe(shown);
  });

  it('names the PDF after the number people see', () => {
    expect(jeoPdfFilename('JEO-2026-4004')).toBe('JEO 4004.pdf');
    expect(jeoPdfFilename('JEO-2026-4004-2')).toBe('JEO 4004-2.pdf');
    expect(jeoPdfFilename('JEO-2026-000004')).toBe('JEO-2026-000004.pdf');
    expect(jeoPdfFilename('4008')).toBe('JEO 4008.pdf');
    expect(jeoPdfFilename('a"b/c')).toBe('JEO a_b_c.pdf');
  });
});

describe('JEO PDF link token', () => {
  const now = Date.UTC(2026, 10, 3, 10);

  it('opens the JEO it was issued for, carrying the viewer name', () => {
    const token = createJeoPdfLinkToken('jeo-1', 'Rajesh', now);
    expect(verifyJeoPdfLinkToken(token, 'jeo-1', now + 1000)).toEqual({ viewerName: 'Rajesh' });
  });

  it('refuses another JEO, an expired link, and any tampering', () => {
    const token = createJeoPdfLinkToken('jeo-1', 'Rajesh', now);
    expect(verifyJeoPdfLinkToken(token, 'jeo-2', now)).toBeNull();
    expect(verifyJeoPdfLinkToken(token, 'jeo-1', now + JEO_PDF_LINK_TTL_MS + 1)).toBeNull();

    const [payload, signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ j: 'jeo-2', e: now + 60_000 })).toString('base64url');
    expect(verifyJeoPdfLinkToken(`${forged}.${signature}`, 'jeo-2', now)).toBeNull();
    expect(verifyJeoPdfLinkToken(`${payload}.${signature.slice(0, -2)}xx`, 'jeo-1', now)).toBeNull();
    expect(verifyJeoPdfLinkToken(`${payload}.${signature}.extra`, 'jeo-1', now)).toBeNull();
    expect(verifyJeoPdfLinkToken('garbage', 'jeo-1', now)).toBeNull();
  });

  it('is not a login token, and a login token is not one of these', () => {
    const token = createJeoPdfLinkToken('jeo-1', undefined, now);
    expect(token.split('.')).toHaveLength(2); // a JWT has three parts
    const jwtLike = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.c2lnbmF0dXJl';
    expect(verifyJeoPdfLinkToken(jwtLike, 'jeo-1', now)).toBeNull();
  });
});

describe('JEO number generation', () => {
  function setup({
    series = { state: 'Telangana', seriesStart: 4000 },
    taken = [] as { jeoNumber: string }[],
  } = {}) {
    const prisma = {
      jobExecutionOrder: {
        findMany: jest.fn().mockResolvedValue(taken),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    };
    const stateSeries = { seriesForState: jest.fn().mockResolvedValue(series) };
    const service = new JobExecutionOrdersService(
      prisma as any, {} as any, {} as any, stateSeries as any, {} as any, {} as any, {} as any, {} as any,
    );
    const generate = (salesOrderNumber: string, state: string | null = 'Telangana') =>
      (service as any).generateJeoNumber({ salesOrderNumber, customer: { state } }) as Promise<string>;
    return { service, prisma, stateSeries, generate };
  }

  it("matches the Sales Order: state series + the order's sequence, with the order's year", async () => {
    const { generate, stateSeries } = setup();
    await expect(generate('SO-2026-000004')).resolves.toBe('JEO-2026-4004');
    expect(stateSeries.seriesForState).toHaveBeenCalledWith('Telangana');
    await expect(generate('SO-2025-000999')).resolves.toBe('JEO-2025-4999');
  });

  it('uses whatever series the state has, including an automatically assigned one', async () => {
    const { generate } = setup({ series: { state: 'Goa', seriesStart: 10000 } });
    await expect(generate('SO-2026-000004', 'Goa')).resolves.toBe('JEO-2026-10004');
  });

  it('numbers a repeat JEO for the same Sales Order -2, -3…', async () => {
    await expect(setup({ taken: [{ jeoNumber: 'JEO-2026-4004' }] }).generate('SO-2026-000004')).resolves.toBe(
      'JEO-2026-4004-2',
    );
    await expect(
      setup({ taken: [{ jeoNumber: 'JEO-2026-4004' }, { jeoNumber: 'JEO-2026-4004-2' }] }).generate('SO-2026-000004'),
    ).resolves.toBe('JEO-2026-4004-3');
  });

  it('never reuses a number an older plain-numbered JEO shows this year', async () => {
    const { generate, prisma } = setup({ taken: [{ jeoNumber: '4004' }] });
    await expect(generate('SO-2026-000004')).resolves.toBe('JEO-2026-4004-2');
    const where = prisma.jobExecutionOrder.findMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({
      jeoNumber: '4004',
      createdAt: { gte: new Date(Date.UTC(2026, 0, 1)), lt: new Date(Date.UTC(2027, 0, 1)) },
    });
  });

  it.each([
    ['a customer with no state', 'SO-2026-000004', null, /has no state set/],
    ['a customer with a blank state', 'SO-2026-000004', '  ', /has no state set/],
    ['a sequence past the series block', 'SO-2026-001000', 'Telangana', /beyond the 999 numbers/],
    ['an unrecognised Sales Order number', 'SO-XYZ', 'Telangana', /SO-YYYY-NNNNNN/],
  ])('refuses, never guesses: %s', async (_label, so, state, message) => {
    const { generate, stateSeries } = setup();
    const error = await generate(so, state).catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.message).toMatch(message);
    expect(stateSeries.seriesForState).not.toHaveBeenCalled();
  });

  it('a number clash from a double submit for the same Sales Order stops, instead of making a second JEO', async () => {
    const { service, prisma } = setup();
    prisma.jobExecutionOrder.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['jeoNumber'] },
      }),
    );
    prisma.jobExecutionOrder.findFirst.mockResolvedValue({ id: 'jeo-concurrent' });
    const salesOrder = {
      id: 'so-1', customerId: 'c1', quotationId: 'q1', deliveryDate: null,
      salesOrderNumber: 'SO-2026-000004', customer: { state: 'Telangana' },
    };
    await expect((service as any).performJeoCreate(salesOrder, {}, 'Tester', null)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.jobExecutionOrder.create).toHaveBeenCalledTimes(1);
  });
});

describe('JEO search', () => {
  it('finds "JEO 4004" (as shown on screen) by its number, and plain searches as before', async () => {
    const prisma = { jobExecutionOrder: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) } };
    const service = new JobExecutionOrdersService(
      prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    );
    await service.findAll({ search: 'JEO 4004' } as any);
    expect(prisma.jobExecutionOrder.findMany.mock.calls[0][0].where.OR).toEqual(
      expect.arrayContaining([
        { jeoNumber: { contains: 'JEO 4004', mode: 'insensitive' } },
        { jeoNumber: { contains: '4004', mode: 'insensitive' } },
      ]),
    );
    await service.findAll({ search: '4004' } as any);
    const plain = prisma.jobExecutionOrder.findMany.mock.calls[1][0].where.OR;
    expect(plain.filter((c: any) => c.jeoNumber)).toEqual([{ jeoNumber: { contains: '4004', mode: 'insensitive' } }]);
  });
});

describe('PDF link', () => {
  it('points at the JEO number file name, and refuses a JEO that does not exist', async () => {
    const prisma = {
      jobExecutionOrder: {
        findUnique: jest.fn().mockResolvedValueOnce({ jeoNumber: 'JEO-2026-4004' }).mockResolvedValueOnce(null),
      },
    };
    const service = new JobExecutionOrdersService(
      prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    );
    const { url } = await service.createPdfLink('jeo-1', 'Rajesh');
    expect(url).toMatch(/^\/api\/v1\/public\/job-execution-orders\/jeo-1\/view\/[^/]+\/JEO%204004\.pdf$/);
    await expect(service.createPdfLink('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('serves the PDF only with a valid link', async () => {
    const service = new JobExecutionOrdersService(
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    );
    const getPdf = jest.spyOn(service, 'getPdf').mockResolvedValue({ pdf: Buffer.from('x'), filename: 'JEO 4004.pdf' });
    const token = createJeoPdfLinkToken('jeo-1', 'Rajesh');
    await expect(service.getPdfViaLink('jeo-1', token)).resolves.toEqual({ pdf: Buffer.from('x'), filename: 'JEO 4004.pdf' });
    expect(getPdf).toHaveBeenCalledWith('jeo-1', 'Rajesh');
    await expect(service.getPdfViaLink('jeo-2', token)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('State series for a JEO', () => {
  function setup(existing: { state: string; seriesStart: number }[]) {
    const rows = [...existing];
    const prisma: any = {
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
      $executeRaw: jest.fn().mockResolvedValue(0),
      stateSeriesCode: {
        findUnique: jest.fn(async ({ where }: any) => rows.find((r) => r.state === where.state) ?? null),
        findMany: jest.fn(async () => rows),
        aggregate: jest.fn(async () => ({
          _max: { seriesStart: rows.length ? Math.max(...rows.map((r) => r.seriesStart)) : null },
        })),
        create: jest.fn(async ({ data }: any) => {
          rows.push(data);
          return data;
        }),
      },
    };
    return { service: new StateSeriesCodesService(prisma), prisma };
  }
  const CONFIGURED = [
    { state: 'Telangana', seriesStart: 4000 },
    { state: 'Andhra Pradesh', seriesStart: 5000 },
    { state: 'Tamil Nadu', seriesStart: 6000 },
    { state: 'Karnataka', seriesStart: 7000 },
    { state: 'Kerala', seriesStart: 8000 },
    { state: 'Maharashtra', seriesStart: 9000 },
  ];

  it('uses a configured series as is', async () => {
    const { service, prisma } = setup(CONFIGURED);
    await expect(service.seriesForState('Andhra Pradesh')).resolves.toMatchObject({ seriesStart: 5000 });
    expect(prisma.stateSeriesCode.create).not.toHaveBeenCalled();
  });

  it('adds a new state with the next free block, under the table lock', async () => {
    const { service, prisma } = setup(CONFIGURED);
    await expect(service.seriesForState('Goa')).resolves.toMatchObject({ state: 'Goa', seriesStart: 10000 });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.stateSeriesCode.create).toHaveBeenCalledWith({
      data: { state: 'Goa', seriesStart: 10000, nextNumber: 10000 },
    });
    await expect(service.seriesForState('Meghalaya')).resolves.toMatchObject({ seriesStart: 11000 });
  });

  it('matches the state case-insensitively to its official spelling', async () => {
    const { service } = setup(CONFIGURED);
    await expect(service.seriesForState(' goa ')).resolves.toMatchObject({ state: 'Goa' });
  });

  it('starts at 4000 when nothing is configured yet', async () => {
    const { service } = setup([]);
    await expect(service.seriesForState('Goa')).resolves.toMatchObject({ seriesStart: 4000 });
  });

  it('takes the row another request created first, instead of a second block', async () => {
    const { service, prisma } = setup(CONFIGURED);
    prisma.stateSeriesCode.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ state: 'Goa', seriesStart: 10000 });
    await expect(service.seriesForState('Goa')).resolves.toMatchObject({ seriesStart: 10000 });
    expect(prisma.stateSeriesCode.create).not.toHaveBeenCalled();
  });

  it('refuses a state that is not an Indian state or union territory', async () => {
    const { service, prisma } = setup(CONFIGURED);
    await expect(service.seriesForState('Atlantis')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.stateSeriesCode.create).not.toHaveBeenCalled();
  });
});
