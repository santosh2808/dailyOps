import { Global, Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaService } from '../../src/prisma/prisma.service';
import { WhatsAppModule } from '../../src/whatsapp/whatsapp.module';
import { AISENSY_SEND_URL, sendAisensyCampaign } from '../../src/whatsapp/aisensy';
import { maskPhone, toAisensyDestination } from '../../src/whatsapp/normalize-phone';
import { normalizeTemplateParams, WhatsAppService, type WhatsAppSendOptions } from '../../src/whatsapp/whatsapp.service';
import { WHATSAPP_USE_CASES, type WhatsAppUseCase } from '../../src/whatsapp/whatsapp-use-cases';
import { QuotationsService } from '../../src/quotations/quotations.service';
import { ProformaInvoicesService } from '../../src/proforma-invoices/proforma-invoices.service';
import { TaxInvoicesService } from '../../src/tax-invoices/tax-invoices.service';
import { JobExecutionOrdersService } from '../../src/job-execution-orders/job-execution-orders.service';
import {
  factoryWhatsAppRecipients,
  MAX_FACTORY_WHATSAPP_RECIPIENTS,
} from '../../src/job-execution-orders/factory-whatsapp-recipients';
import { LeadsService } from '../../src/leads/leads.service';
import { LeadFollowUpReminderService } from '../../src/leads/lead-followup-reminder.service';
import { SalesOrdersService } from '../../src/sales-orders/sales-orders.service';

const API_KEY = 'test-aisensy-key-123';
const APPROVED_CAMPAIGNS = {
  AISENSY_QUOTATION_SHARE_CAMPAIGN: 'quotation_share_test',
  AISENSY_PROFORMA_INVOICE_SHARE_CAMPAIGN: 'proforma_share_test',
  AISENSY_TAX_INVOICE_SHARE_CAMPAIGN: 'tax_invoice_share_test',
  AISENSY_JEO_FACTORY_CAMPAIGN: 'jeo_factory_test',
  AISENSY_SALES_ORDER_CREATED_CAMPAIGN: 'so_created_test',
  AISENSY_SALES_ORDER_DISPATCHED_CAMPAIGN: 'so_dispatched_test',
};
// Not read by the code at all — set here to prove configuration alone
// can't switch the automatic notifications on.
const AUTOMATIC_CAMPAIGNS = {
  AISENSY_LEAD_ASSIGNED_CAMPAIGN: 'x',
  AISENSY_LEAD_FOLLOWUP_REMINDER_CAMPAIGN: 'x',
  AISENSY_SITE_VISIT_SCHEDULED_CAMPAIGN: 'x',
  AISENSY_SALES_ORDER_STATUS_CAMPAIGN: 'x',
};
const ENV_KEYS = [
  'WHATSAPP_PROVIDER',
  'AISENSY_API_KEY',
  'INTERAKT_API_KEY',
  'FACTORY_WHATSAPP_RECIPIENTS',
  ...Object.keys(APPROVED_CAMPAIGNS),
  ...Object.keys(AUTOMATIC_CAMPAIGNS),
];

const share = (overrides: Partial<WhatsAppSendOptions> = {}): WhatsAppSendOptions => ({
  phone: '9876543210',
  templateName: 'quotation_share',
  bodyValues: ['Tarun Kumar', 'Q-0001', 'https://app.example/quote/tok'],
  useCase: 'QUOTATION_SHARE',
  documentId: 'q1',
  sentBy: 'Asha',
  ...overrides,
});

const accepted = () => jest.fn().mockResolvedValue(new Response('{"status":"success"}', { status: 200 }));

function mockPrisma() {
  const prisma: any = {
    whatsAppMessage: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'm1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  prisma.$transaction = jest.fn((fn: (tx: any) => unknown) => fn(prisma));
  return prisma;
}

describe('WhatsApp via AiSensy', () => {
  const saved: Record<string, string | undefined> = {};
  let logs: string[];

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    logs = [];
    for (const level of ['log', 'warn', 'error'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation((msg: unknown) => {
        logs.push(String(msg));
      });
    }
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    jest.restoreAllMocks();
  });

  // fetch is replaced for every test, so no request can reach the network.
  const make = (env: Record<string, string>, fetchImpl: jest.Mock = accepted()) => {
    Object.assign(process.env, env);
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchImpl);
    const prisma = mockPrisma();
    return { svc: new WhatsAppService(prisma), prisma, fetchImpl };
  };
  const live = { WHATSAPP_PROVIDER: 'aisensy', AISENSY_API_KEY: API_KEY, ...APPROVED_CAMPAIGNS };

  describe('disabled by default', () => {
    it('keeps the existing Interakt simulation when WHATSAPP_PROVIDER is unset', async () => {
      const { svc, prisma, fetchImpl } = make({});
      await expect(svc.sendTemplateMessage(share())).resolves.toEqual({ status: 'SIMULATED' });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
      expect(logs.join('\n')).toContain('[SIMULATED WhatsApp] to +919876543210 via template "quotation_share"');
    });

    it('treats an unknown provider as the existing Interakt path', async () => {
      const { svc, fetchImpl } = make({ WHATSAPP_PROVIDER: 'aisnesy', AISENSY_API_KEY: API_KEY, ...APPROVED_CAMPAIGNS });
      await expect(svc.sendTemplateMessage(share())).resolves.toEqual({ status: 'SIMULATED' });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(logs.join('\n')).toContain('Unknown WHATSAPP_PROVIDER');
    });

    it('simulates when the API key is missing', async () => {
      const { svc, prisma, fetchImpl } = make({ WHATSAPP_PROVIDER: 'aisensy', ...APPROVED_CAMPAIGNS });
      await expect(svc.sendTemplateMessage(share())).resolves.toEqual({ status: 'SIMULATED' });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: 'SIMULATED', useCase: 'QUOTATION_SHARE', documentId: 'q1', campaignName: null }),
      });
      expect(logs.join('\n')).toContain('AISENSY_API_KEY not set');
    });

    it('simulates when only that use case\'s campaign is missing', async () => {
      const { svc, fetchImpl } = make({ WHATSAPP_PROVIDER: 'aisensy', AISENSY_API_KEY: API_KEY });
      await expect(svc.sendTemplateMessage(share())).resolves.toEqual({ status: 'SIMULATED' });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(logs.join('\n')).toContain('AISENSY_QUOTATION_SHARE_CAMPAIGN not set');
    });

    it('still returns SIMULATED if recording the simulation fails', async () => {
      const { svc, prisma } = make({ WHATSAPP_PROVIDER: 'aisensy' });
      prisma.whatsAppMessage.create.mockRejectedValue(new Error('relation does not exist'));
      await expect(svc.sendTemplateMessage(share())).resolves.toEqual({ status: 'SIMULATED' });
    });

    it.each(['LEAD_ASSIGNED', 'LEAD_FOLLOWUP_REMINDER', 'SITE_VISIT_SCHEDULED', 'SALES_ORDER_STATUS'] as WhatsAppUseCase[])(
      'never sends %s for real, even with every variable set',
      async (useCase) => {
        const { svc, prisma, fetchImpl } = make({ ...live, ...AUTOMATIC_CAMPAIGNS });
        const bodyValues = Array.from({ length: WHATSAPP_USE_CASES[useCase].paramCount }, (_, i) => `v${i}`);
        await expect(svc.sendTemplateMessage(share({ useCase, bodyValues, documentId: undefined }))).resolves.toEqual({
          status: 'SIMULATED',
        });
        expect(fetchImpl).not.toHaveBeenCalled();
        expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
        expect(logs.join('\n')).toContain('not approved for real sends');
      },
    );

    it('simulates an automatic notification with a blank value instead of logging an error', async () => {
      const { svc, fetchImpl } = make(live);
      const errorSpy = jest.spyOn(Logger.prototype, 'error');
      const bodyValues = ['Ravi', '', 'L-1', 'Acme', '9876543210'];
      await expect(svc.sendTemplateMessage(share({ useCase: 'LEAD_ASSIGNED', bodyValues, documentId: undefined }))).resolves.toEqual({
        status: 'SIMULATED',
      });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe('real send (mocked AiSensy)', () => {
    it('posts the campaign request and reports ACCEPTED, not delivered', async () => {
      const { svc, prisma, fetchImpl } = make(live);
      await expect(svc.sendTemplateMessage(share())).resolves.toEqual({ status: 'ACCEPTED' });

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe(AISENSY_SEND_URL);
      expect(init.method).toBe('POST');
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(JSON.parse(init.body)).toEqual({
        apiKey: API_KEY,
        campaignName: 'quotation_share_test',
        destination: '+919876543210',
        userName: 'Tarun Kumar',
        templateParams: ['Tarun Kumar', 'Q-0001', 'https://app.example/quote/tok'],
      });
      expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          provider: 'AISENSY',
          useCase: 'QUOTATION_SHARE',
          documentId: 'q1',
          destination: '+919876543210',
          campaignName: 'quotation_share_test',
          status: 'PENDING',
          sentBy: 'Asha',
        }),
        select: { id: true },
      });
      expect(prisma.whatsAppMessage.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { status: 'ACCEPTED', errorMessage: null },
      });
    });

    it('never logs the API key or the full phone number', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(new Response(`{"message":"bad key ${API_KEY}"}`, { status: 401 }));
      const { svc } = make(live, fetchImpl);
      const result = await svc.sendTemplateMessage(share());
      expect(result.status).toBe('FAILED');
      expect(result.errorMessage).not.toContain(API_KEY);
      const all = logs.join('\n');
      expect(all).not.toContain(API_KEY);
      expect(all).not.toContain('9876543210');
      expect(all).toContain('+91******3210');
    });

    it('refuses a duplicate inside the window without calling AiSensy', async () => {
      const { svc, prisma, fetchImpl } = make(live);
      prisma.whatsAppMessage.findFirst.mockResolvedValue({ id: 'earlier' });
      const result = await svc.sendTemplateMessage(share());
      expect(result.status).toBe('DUPLICATE');
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();

      const where = prisma.whatsAppMessage.findFirst.mock.calls[0][0].where;
      expect(where).toMatchObject({
        useCase: 'QUOTATION_SHARE',
        documentId: 'q1',
        destination: '+919876543210',
        status: { in: ['PENDING', 'ACCEPTED', 'UNKNOWN'] },
      });
      expect(Date.now() - where.createdAt.gte.getTime()).toBeGreaterThanOrEqual(2 * 60 * 1000 - 1000);
      // The check runs under a transaction-scoped advisory lock keyed on the same tuple.
      expect(prisma.$executeRaw.mock.calls[0].slice(1)).toEqual(['whatsapp:QUOTATION_SHARE:q1:+919876543210']);
    });

    it('does not send if the claim cannot be recorded', async () => {
      const { svc, prisma, fetchImpl } = make(live);
      prisma.$transaction.mockRejectedValue(new Error('relation "WhatsAppMessage" does not exist'));
      const result = await svc.sendTemplateMessage(share());
      expect(result.status).toBe('FAILED');
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('logs only the database error code, never the query arguments', async () => {
      const { svc, prisma, fetchImpl } = make(live);
      prisma.$transaction.mockRejectedValue(
        Object.assign(new Error('Invalid `whatsAppMessage.create()`: { destination: "+919876543210" }'), { code: 'P2021' }),
      );
      expect((await svc.sendTemplateMessage(share())).status).toBe('FAILED');
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(logs.join('\n')).toContain('could not record it (P2021)');
      expect(logs.join('\n')).not.toContain('9876543210');
    });

    it('still returns the AiSensy outcome if the history update fails', async () => {
      const { svc, prisma } = make(live);
      prisma.whatsAppMessage.update.mockRejectedValue(new Error('db down'));
      await expect(svc.sendTemplateMessage(share())).resolves.toEqual({ status: 'ACCEPTED' });
    });

    it('refuses a real send that has no document id', async () => {
      const { svc, fetchImpl } = make(live);
      expect((await svc.sendTemplateMessage(share({ documentId: undefined }))).status).toBe('FAILED');
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it.each([
      ['no phone', { phone: null }],
      ['a landline', { phone: '0402345678' }],
      ['a non-Indian number', { phone: '+14155550123' }],
      ['too few values', { bodyValues: ['Ravi', 'Q-1'] }],
      ['an empty value', { bodyValues: ['Ravi', '  ', 'link'] }],
      ['an over-long value', { bodyValues: ['Ravi', 'x'.repeat(1025), 'link'] }],
    ])('fails before sending on %s', async (_label, overrides) => {
      const { svc, prisma, fetchImpl } = make(live);
      const result = await svc.sendTemplateMessage(share(overrides as Partial<WhatsAppSendOptions>));
      expect(result.status).toBe('FAILED');
      expect(result.errorMessage).toBeTruthy();
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('records UNKNOWN on a timeout and does not retry', async () => {
      const fetchImpl = jest.fn().mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
      const { svc, prisma } = make(live, fetchImpl);
      const result = await svc.sendTemplateMessage(share());
      expect(result.status).toBe('UNKNOWN');
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(prisma.whatsAppMessage.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { status: 'UNKNOWN', errorMessage: expect.stringContaining('Check AiSensy') },
      });
    });
  });
});

describe('sendAisensyCampaign', () => {
  const request = { apiKey: API_KEY, campaignName: 'c', destination: '+919876543210', userName: 'Ravi', templateParams: ['a'] };
  const respond = (body: string, status: number) => jest.fn().mockResolvedValue(new Response(body, { status }));

  it('maps 2xx to ACCEPTED', async () => {
    expect(await sendAisensyCampaign(request, respond('', 200) as any)).toEqual({ status: 'ACCEPTED' });
  });

  it('maps 4xx to FAILED with AiSensy\'s message', async () => {
    const out = await sendAisensyCampaign(request, respond('{"message":"Campaign not live"}', 400) as any);
    expect(out).toEqual({ status: 'FAILED', errorMessage: 'AiSensy rejected the message (400): Campaign not live' });
  });

  it('maps a 2xx that says success: false to FAILED', async () => {
    const out = await sendAisensyCampaign(request, respond('{"success":"false","message":"Campaign not live"}', 200) as any);
    expect(out).toEqual({ status: 'FAILED', errorMessage: 'AiSensy rejected the message: Campaign not live' });
  });

  it('masks the phone number wherever AiSensy echoes it back', async () => {
    const out = await sendAisensyCampaign(
      request,
      respond('{"message":"Invalid destination +919876543210 (919876543210 / 9876543210)"}', 400) as any,
    );
    expect(out.errorMessage).not.toContain('9876543210');
    expect(out.errorMessage).toContain('+91******3210');
  });

  it('caps a non-JSON error body', async () => {
    const out = await sendAisensyCampaign(request, respond(`<html>${'x'.repeat(5000)}</html>`, 429) as any);
    expect(out.status).toBe('FAILED');
    expect(out.errorMessage!.length).toBeLessThan(400);
  });

  it('maps 5xx to UNKNOWN', async () => {
    expect((await sendAisensyCampaign(request, respond('oops', 502) as any)).status).toBe('UNKNOWN');
  });

  it('maps a refused connection to FAILED (nothing was sent)', async () => {
    const err = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    expect((await sendAisensyCampaign(request, jest.fn().mockRejectedValue(err) as any)).status).toBe('FAILED');
  });

  it('maps a reset mid-request to UNKNOWN', async () => {
    const err = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
    expect((await sendAisensyCampaign(request, jest.fn().mockRejectedValue(err) as any)).status).toBe('UNKNOWN');
  });

  it('aborts a hung request after the timeout', async () => {
    const hang = jest.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(init.signal!.reason));
    }));
    expect((await sendAisensyCampaign(request, hang as any, 20)).status).toBe('UNKNOWN');
  });
});

describe('WhatsApp helpers', () => {
  it.each([
    ['9876543210', '+919876543210'],
    ['+91 98765 43210', '+919876543210'],
    ['09876543210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['5876543210', null],
    ['12345', null],
    [null, null],
  ])('toAisensyDestination(%p) = %p', (input, expected) => {
    expect(toAisensyDestination(input)).toBe(expected);
  });

  it('masks phones for logs', () => {
    expect(maskPhone('+919876543210')).toBe('+91******3210');
  });

  it('collapses whitespace that WhatsApp rejects inside template values', () => {
    expect(normalizeTemplateParams(['Ravi\n Kumar', 'Q-1\t', 'a    b'], 3)).toEqual({ values: ['Ravi Kumar', 'Q-1', 'a b'] });
  });
});

// Phase D — every existing caller, wired to the real WhatsAppService with a
// mocked AiSensy, every campaign variable set (including ones for the
// automatic notifications that the code does not read).
describe('existing WhatsApp callers under AiSensy', () => {
  const saved: Record<string, string | undefined> = {};
  let fetchImpl: jest.Mock;
  let prisma: any;
  let wa: WhatsAppService;
  const mailer = { send: jest.fn().mockResolvedValue(undefined) };
  const customer = { phone: '9876543210', contactPerson: 'Ravi Kumar', email: null };

  beforeEach(() => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    Object.assign(process.env, { WHATSAPP_PROVIDER: 'aisensy', AISENSY_API_KEY: API_KEY, ...APPROVED_CAMPAIGNS, ...AUTOMATIC_CAMPAIGNS });
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    fetchImpl = accepted();
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchImpl);
    prisma = mockPrisma();
    wa = new WhatsAppService(prisma);
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    jest.restoreAllMocks();
  });

  const sentBody = () => JSON.parse(fetchImpl.mock.calls[0][1].body);

  it.each([
    [
      'quotation',
      () => {
        const svc = new QuotationsService(prisma, ...([{}, {}, {}, {}, {}, {}, {}, {}] as [any, any, any, any, any, any, any, any]), wa);
        jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 'doc1', publicToken: 'tok', quotationNumber: 'Q-0001', customer } as any);
        return svc;
      },
      'QUOTATION_SHARE',
      'quotation_share_test',
      'Q-0001',
      '/quote/tok',
    ],
    [
      'proforma invoice',
      () => {
        const svc = new ProformaInvoicesService(prisma, {} as any, {} as any, {} as any, wa, {} as any);
        jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 'doc1', invoiceNumber: 'PI-0001', customer } as any);
        jest.spyOn(svc, 'getOrCreatePublicToken').mockResolvedValue('tok');
        return svc;
      },
      'PROFORMA_INVOICE_SHARE',
      'proforma_share_test',
      'PI-0001',
      '/api/v1/public/proforma-invoices/tok/pdf',
    ],
    [
      'tax invoice',
      () => {
        const svc = new TaxInvoicesService(prisma, {} as any, {} as any, {} as any, wa);
        jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 'doc1', invoiceNumber: 'TI-0001', customer } as any);
        jest.spyOn(svc, 'getOrCreatePublicToken').mockResolvedValue('tok');
        return svc;
      },
      'TAX_INVOICE_SHARE',
      'tax_invoice_share_test',
      'TI-0001',
      '/api/v1/public/tax-invoices/tok/pdf',
    ],
  ])('%s share sends its own campaign and is recorded', async (_label, build, useCase, campaign, number, linkPath) => {
    const svc = build() as { sendWhatsAppShare(id: string, sentBy?: string): Promise<unknown> };
    await expect(svc.sendWhatsAppShare('doc1', 'Asha')).resolves.toEqual({ status: 'ACCEPTED', phone: '9876543210' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = sentBody();
    expect(body).toMatchObject({ campaignName: campaign, destination: '+919876543210', userName: 'Ravi Kumar' });
    expect(body.templateParams).toHaveLength(3);
    expect(body.templateParams.slice(0, 2)).toEqual(['Ravi Kumar', number]);
    expect(body.templateParams[2]).toMatch(new RegExp(`^https?://.+${linkPath.replace(/[/.]/g, '\\$&')}$`));
    expect(prisma.whatsAppMessage.create.mock.calls[0][0].data).toMatchObject({ useCase, documentId: 'doc1', sentBy: 'Asha' });
  });

  it('quotation share falls back to "Customer" when the contact name is blank', async () => {
    const svc = new QuotationsService(prisma, ...([{}, {}, {}, {}, {}, {}, {}, {}] as [any, any, any, any, any, any, any, any]), wa);
    jest
      .spyOn(svc, 'findOne')
      .mockResolvedValue({ id: 'doc1', publicToken: 'tok', quotationNumber: 'Q-0001', customer: { ...customer, contactPerson: '' } } as any);
    await expect(svc.sendWhatsAppShare('doc1')).resolves.toMatchObject({ status: 'ACCEPTED' });
    expect(sentBody()).toMatchObject({ userName: 'Customer' });
  });

  const expectSimulatedOnly = () => {
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
  };

  it('lead assigned stays simulated', async () => {
    prisma.user = { findUnique: jest.fn().mockResolvedValue({ name: 'Asha', email: null, phone: '9123456780' }) };
    const svc = new LeadsService(prisma, mailer as any, wa, {} as any);
    const sendSpy = jest.spyOn(wa, 'sendTemplateMessage');
    await (svc as any).notifyLeadAssigned('u1', { id: 'l1', leadNumber: 'L-1', title: 't', companyName: 'Acme', contactPerson: 'Ravi', phone: '9876543210' });
    expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ useCase: 'LEAD_ASSIGNED' }));
    await expect(sendSpy.mock.results[0].value).resolves.toEqual({ status: 'SIMULATED' });
    expectSimulatedOnly();
  });

  it('site visit scheduled stays simulated', async () => {
    const svc = new LeadsService(prisma, mailer as any, wa, {} as any);
    const sendSpy = jest.spyOn(wa, 'sendTemplateMessage');
    await (svc as any).notifySiteVisitScheduled({
      id: 'l1', leadNumber: 'L-1', companyName: 'Acme', contactPerson: 'Ravi', email: null, phone: '9876543210',
      nextFollowUp: new Date('2026-11-02T05:00:00Z'), reminderNote: null,
    });
    expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ useCase: 'SITE_VISIT_SCHEDULED' }));
    await expect(sendSpy.mock.results[0].value).resolves.toEqual({ status: 'SIMULATED' });
    expectSimulatedOnly();
  });

  it('daily follow-up reminder stays simulated and is still marked as sent', async () => {
    prisma.lead = {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'l1', leadNumber: 'L-1', title: 't', companyName: 'Acme', contactPerson: 'Ravi', phone: '9876543210',
          reminderNote: null, nextFollowUp: new Date(),
          assignedToUser: { id: 'u1', name: 'Asha', email: null, phone: '9123456780' },
        },
      ]),
      update: jest.fn().mockResolvedValue({}),
    };
    const svc = new LeadFollowUpReminderService(prisma, mailer as any, wa);
    const sendSpy = jest.spyOn(wa, 'sendTemplateMessage');
    await svc.sendDueReminders();
    expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ useCase: 'LEAD_FOLLOWUP_REMINDER' }));
    await expect(sendSpy.mock.results[0].value).resolves.toEqual({ status: 'SIMULATED' });
    expect(prisma.lead.update).toHaveBeenCalledWith({ where: { id: 'l1' }, data: { followUpReminderSentAt: expect.any(Date) } });
    expectSimulatedOnly();
  });

  it('sales order status update stays simulated', async () => {
    const svc = new SalesOrdersService(prisma, mailer as any, {} as any, {} as any, {} as any, wa);
    const sendSpy = jest.spyOn(wa, 'sendTemplateMessage');
    await (svc as any).notifyCustomerStatusChange(
      { id: 'so1', salesOrderNumber: 'SO-1', customer },
      'PRODUCTION_STARTED',
      'CONFIRMED',
      'Asha',
    );
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ useCase: 'SALES_ORDER_STATUS' }));
    await expect(sendSpy.mock.results[0].value).resolves.toEqual({ status: 'SIMULATED' });
    expectSimulatedOnly();
  });

  describe('sales order tracking WhatsApp', () => {
    const TOKEN = 'T'.repeat(32);
    const order = { id: 'so1', salesOrderNumber: 'SO-0001', trackingToken: TOKEN, customer };
    const buildSo = () => new SalesOrdersService(prisma, mailer as any, {} as any, {} as any, {} as any, wa);
    const notify = (svc: SalesOrdersService, o: object, useCase: string) =>
      (svc as any).notifyCustomerTrackingWhatsApp(o, useCase, 'Asha') as Promise<void>;
    // The status-change path fires the tracking WhatsApp without awaiting
    // it; this waits for that send to finish.
    const statusChange = async (svc: SalesOrdersService, to: string, from: string) => {
      const spy = jest.spyOn(svc as any, 'notifyCustomerTrackingWhatsApp');
      await (svc as any).notifyCustomerStatusChange(order, to, from, 'Asha');
      await Promise.all(spy.mock.results.map((r) => r.value));
      return spy;
    };

    it('order placed: sends the tracking link to the customer', async () => {
      await notify(buildSo(), order, 'SALES_ORDER_CREATED');
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const body = sentBody();
      expect(body).toMatchObject({ campaignName: 'so_created_test', destination: '+919876543210', userName: 'Ravi Kumar' });
      expect(body.templateParams.slice(0, 2)).toEqual(['Ravi Kumar', 'SO-0001']);
      expect(body.templateParams[2]).toMatch(new RegExp(`^https?://.+/track/${TOKEN}$`));
      expect(prisma.whatsAppMessage.create.mock.calls[0][0].data).toMatchObject({
        useCase: 'SALES_ORDER_CREATED',
        documentId: 'so1',
        sentBy: 'Asha',
      });
    });

    it('dispatched: sends its own campaign; the shared status message stays simulated', async () => {
      const svc = buildSo();
      const sendSpy = jest.spyOn(wa, 'sendTemplateMessage');
      const spy = await statusChange(svc, 'DISPATCHED', 'READY_FOR_DISPATCH');
      expect(spy).toHaveBeenCalledWith(order, 'SALES_ORDER_DISPATCHED', 'Asha');
      expect(sendSpy.mock.calls.map(([o]) => o.useCase)).toEqual(['SALES_ORDER_STATUS', 'SALES_ORDER_DISPATCHED']);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(sentBody()).toMatchObject({ campaignName: 'so_dispatched_test', destination: '+919876543210' });
    });

    it.each([
      ['another status', 'CONFIRMED', 'DRAFT'],
      ['a no-op status change', 'DISPATCHED', 'DISPATCHED'],
    ])('does not send the tracking WhatsApp for %s', async (_label, to, from) => {
      const spy = await statusChange(buildSo(), to, from);
      expect(spy).not.toHaveBeenCalled();
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('gives an order created before tracking existed a token first', async () => {
      prisma.salesOrder = {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({ trackingToken: 'N'.repeat(32) }),
      };
      await notify(buildSo(), { ...order, trackingToken: null }, 'SALES_ORDER_DISPATCHED');
      expect(prisma.salesOrder.updateMany).toHaveBeenCalledWith({
        where: { id: 'so1', trackingToken: null },
        data: { trackingToken: expect.stringMatching(/^[A-Za-z0-9_-]{32}$/) },
      });
      expect(sentBody().templateParams[2]).toMatch(new RegExp(`/track/${'N'.repeat(32)}$`));
    });

    it('sends nothing to a customer with no phone number', async () => {
      await expect(notify(buildSo(), { ...order, customer: { ...customer, phone: ' ' } }, 'SALES_ORDER_CREATED')).resolves.toBeUndefined();
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('stays simulated without its campaign', async () => {
      delete process.env.AISENSY_SALES_ORDER_CREATED_CAMPAIGN;
      await notify(buildSo(), order, 'SALES_ORDER_CREATED');
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('never throws, even if the link cannot be created', async () => {
      prisma.salesOrder = { updateMany: jest.fn().mockRejectedValue(new Error('db down')) };
      await expect(notify(buildSo(), { ...order, trackingToken: null }, 'SALES_ORDER_CREATED')).resolves.toBeUndefined();
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });

  describe('JEO factory WhatsApp', () => {
    const jeo = {
      id: 'jeo1',
      jeoNumber: 'JEO-0001',
      priority: 'HIGH',
      salesOrder: { salesOrderNumber: 'SO-0001' },
      customer: { ...customer, companyName: 'Acme Industries' },
    };
    const buildJeo = () => {
      const svc = new JobExecutionOrdersService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, wa, {} as any);
      jest.spyOn(svc, 'getOrCreatePublicToken').mockResolvedValue('tok');
      return svc;
    };
    const notify = (svc: JobExecutionOrdersService) => (svc as any).notifyFactoryWhatsApp(jeo, 'Asha') as Promise<void>;

    it('sends to each factory number, never to the customer', async () => {
      process.env.FACTORY_WHATSAPP_RECIPIENTS = 'Krishna:9123456780, Ravi:9988776655';
      await notify(buildJeo());
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      const bodies = fetchImpl.mock.calls.map(([, init]) => JSON.parse(init.body));
      expect(bodies.map((b) => [b.destination, b.userName])).toEqual([
        ['+919123456780', 'Krishna'],
        ['+919988776655', 'Ravi'],
      ]);
      expect(bodies.map((b) => b.destination)).not.toContain('+919876543210');
      expect(bodies[0]).toMatchObject({ campaignName: 'jeo_factory_test' });
      expect(bodies[0].templateParams.slice(0, 4)).toEqual(['JEO-0001', 'SO-0001', 'Acme Industries', 'High']);
      expect(bodies[0].templateParams[4]).toMatch(/^https?:\/\/.+\/api\/v1\/public\/job-execution-orders\/tok\/pdf$/);
      expect(prisma.whatsAppMessage.create.mock.calls[0][0].data).toMatchObject({
        useCase: 'JEO_FACTORY_NOTIFICATION',
        documentId: 'jeo1',
        sentBy: 'Asha',
      });
    });

    it('sends nothing when no factory numbers are configured', async () => {
      delete process.env.FACTORY_WHATSAPP_RECIPIENTS;
      const svc = buildJeo();
      await notify(svc);
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(svc.getOrCreatePublicToken).not.toHaveBeenCalled();
    });

    it('stays simulated without its campaign', async () => {
      delete process.env.AISENSY_JEO_FACTORY_CAMPAIGN;
      process.env.FACTORY_WHATSAPP_RECIPIENTS = 'Krishna:9123456780';
      await notify(buildJeo());
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('never throws, even if the link cannot be created', async () => {
      process.env.FACTORY_WHATSAPP_RECIPIENTS = 'Krishna:9123456780';
      const svc = buildJeo();
      jest.spyOn(svc, 'getOrCreatePublicToken').mockRejectedValue(new Error('db down'));
      await expect(notify(svc)).resolves.toBeUndefined();
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('a bad number does not stop the others', async () => {
      process.env.FACTORY_WHATSAPP_RECIPIENTS = 'Desk:0401234567,Krishna:9123456780';
      await notify(buildJeo());
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(sentBody().destination).toBe('+919123456780');
    });

    describe('Resend to Factory', () => {
      let mailerMock: { send: jest.Mock };
      let svc: JobExecutionOrdersService;
      let notifySpy: jest.SpyInstance;

      beforeEach(() => {
        mailerMock = { send: jest.fn().mockResolvedValue({ status: 'SENT' }) };
        svc = new JobExecutionOrdersService(
          prisma,
          mailerMock as any,
          { render: jest.fn().mockResolvedValue(Buffer.from('pdf')) } as any,
          {} as any,
          { record: jest.fn().mockResolvedValue(undefined) } as any,
          {} as any,
          wa,
          {} as any,
        );
        jest.spyOn(svc, 'findOne').mockResolvedValue(jeo as any);
        jest.spyOn(svc as any, 'toPdfInput').mockReturnValue({});
        // Never settles — proves the resend doesn't wait for the WhatsApp.
        notifySpy = jest.spyOn(svc as any, 'notifyFactoryWhatsApp').mockReturnValue(new Promise(() => undefined));
      });

      it('also resends the WhatsApp, without waiting for it', async () => {
        await expect(svc.sendFactoryNotification('jeo1', {}, 'Asha')).resolves.toMatchObject({ emailStatus: 'SENT' });
        expect(notifySpy).toHaveBeenCalledWith(jeo, 'Asha');
        expect(mailerMock.send).toHaveBeenCalledTimes(1);
      });

      it('does not re-message the factory for a copy emailed to someone else', async () => {
        await svc.sendFactoryNotification('jeo1', { recipientEmail: 'qa@example.com' }, 'Asha');
        expect(mailerMock.send).toHaveBeenCalledTimes(1);
        expect(notifySpy).not.toHaveBeenCalled();
      });

      it('does not send the WhatsApp if the email step fails', async () => {
        mailerMock.send.mockRejectedValue(new Error('smtp down'));
        await expect(svc.sendFactoryNotification('jeo1', {}, 'Asha')).rejects.toThrow('smtp down');
        expect(notifySpy).not.toHaveBeenCalled();
      });
    });
  });
});

describe('AiSensy-only use cases on the Interakt path', () => {
  const saved: Record<string, string | undefined> = {};

  // Start from no WhatsApp settings, whatever the local .env has.
  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    jest.restoreAllMocks();
  });

  it.each([
    ['JEO_FACTORY_NOTIFICATION', ['J', 'S', 'C', 'P', 'L']],
    ['SALES_ORDER_CREATED', ['N', 'S', 'L']],
    ['SALES_ORDER_DISPATCHED', ['N', 'S', 'L']],
  ] as [WhatsAppUseCase, string[]][])('never sends %s through Interakt, even with its key set', async (useCase, bodyValues) => {
    process.env.INTERAKT_API_KEY = 'interakt-key';
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(accepted());
    const svc = new WhatsAppService(mockPrisma());
    const result = await svc.sendTemplateMessage(share({ useCase, bodyValues }));
    expect(result).toEqual({ status: 'SIMULATED' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('factoryWhatsAppRecipients', () => {
  it('parses names and numbers, skipping blanks and repeats', () => {
    expect(factoryWhatsAppRecipients(' Krishna : 9123456780 ,,9988776655, Dup:9123456780')).toEqual({
      recipients: [
        { name: 'Krishna', phone: '9123456780' },
        { name: 'Factory', phone: '9988776655' },
      ],
      dropped: 0,
    });
  });

  it('treats the same number in different formats as one person', () => {
    expect(factoryWhatsAppRecipients('Krishna:9876543210,Krishna2:+91 98765 43210').recipients).toEqual([
      { name: 'Krishna', phone: '9876543210' },
    ]);
  });

  it('is empty when unset', () => {
    expect(factoryWhatsAppRecipients(undefined)).toEqual({ recipients: [], dropped: 0 });
  });

  it(`caps the list at ${MAX_FACTORY_WHATSAPP_RECIPIENTS}`, () => {
    const raw = Array.from({ length: 12 }, (_, i) => `P${i}:91234567${String(i).padStart(2, '0')}`).join(',');
    const { recipients, dropped } = factoryWhatsAppRecipients(raw);
    expect(recipients).toHaveLength(MAX_FACTORY_WHATSAPP_RECIPIENTS);
    expect(dropped).toBe(2);
  });
});

describe('WhatsAppModule wiring', () => {
  // The services above are built by hand; this resolves WhatsAppService
  // through Nest's own injector, as the app does at startup.
  it('resolves WhatsAppService with only PrismaService', async () => {
    @Global()
    @Module({ providers: [{ provide: PrismaService, useValue: {} }], exports: [PrismaService] })
    class FakePrismaModule {}
    @Module({ imports: [FakePrismaModule, WhatsAppModule] })
    class AppUnderTest {}

    const app = await NestFactory.createApplicationContext(AppUnderTest, { logger: false, abortOnError: false });
    try {
      expect(app.get(WhatsAppService)).toBeInstanceOf(WhatsAppService);
    } finally {
      await app.close();
    }
  });
});
