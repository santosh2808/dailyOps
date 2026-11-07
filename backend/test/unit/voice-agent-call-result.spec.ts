import { Controller, Get, INestApplication, Logger, Module, UseGuards, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { VoiceAgentController } from '../../src/telephony/voice-agent.controller';
import { VoiceAgentCallResultService } from '../../src/telephony/voice-agent-call-result.service';
import { VoiceAgentServiceGuard, MIN_VOICE_AGENT_KEY_LENGTH } from '../../src/telephony/voice-agent-service.guard';
import { JwtAuthGuard } from '../../src/auth/jwt-auth.guard';
import { JwtStrategy } from '../../src/auth/jwt.strategy';
import { UsersService } from '../../src/users/users.service';

// D.O.T. call-result write-back (Phase 0) — service-to-service auth, the
// HTTP contract, and the result service's correlation / Decision 15 /
// idempotency rules (mocked Prisma; the same rules run against a real
// database in test/integration/voice-agent-call-result.int-spec.ts).

const KEY = 'k'.repeat(MIN_VOICE_AGENT_KEY_LENGTH) + '-test-only-not-a-real-secret';
const JWT_TEST_SECRET = 'jwt-test-only-secret';
const CALL_SID = 'SIMULATEDcallsid0001';

// A plain JWT-protected route, standing in for every normal-user API: the
// service key must NOT open it.
@Controller('api/v1/probe')
class JwtProtectedProbeController {
  @Get()
  @UseGuards(JwtAuthGuard)
  probe() {
    return { reached: true };
  }
}

describe('Voice-agent result endpoint — authentication and HTTP contract', () => {
  let app: INestApplication;
  let baseUrl: string;
  let validUserJwt: string;
  const submit = jest.fn();
  const originalKey = process.env.VOICE_AGENT_SERVICE_KEY;
  const originalJwtSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    // JwtStrategy reads JWT_SECRET when constructed.
    process.env.JWT_SECRET = JWT_TEST_SECRET;
    // Minimal real Nest app (no @nestjs/testing dependency in this repo):
    // the real controller + guards (throttler, service key), the real JWT
    // guard/strategy on a probe route, and a mocked result service.
    @Module({
      imports: [PassportModule, ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }])],
      controllers: [VoiceAgentController, JwtProtectedProbeController],
      providers: [
        VoiceAgentServiceGuard,
        JwtStrategy,
        { provide: VoiceAgentCallResultService, useValue: { submit } },
        {
          provide: UsersService,
          useValue: {
            // A real, active DailyOps user with every permission.
            findByIdWithAccess: jest.fn().mockResolvedValue({
              id: 'user-1',
              name: 'Admin',
              username: 'admin',
              email: 'admin@example.invalid',
              role: 'admin',
              isActive: true,
              roleNames: ['Administrator'],
              permissionCodes: ['telephony.test', 'lead.edit'],
            }),
          },
        },
      ],
    })
    class VoiceAgentHttpTestModule {}

    app = await NestFactory.create(VoiceAgentHttpTestModule, { logger: false });
    // Same global pipe options as src/main.ts.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    validUserJwt = new JwtService({ secret: JWT_TEST_SECRET }).sign({ sub: 'user-1', email: 'x', role: 'admin' });
  });

  afterAll(async () => {
    await app.close();
    if (originalKey === undefined) delete process.env.VOICE_AGENT_SERVICE_KEY;
    else process.env.VOICE_AGENT_SERVICE_KEY = originalKey;
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  });

  beforeEach(() => {
    submit.mockReset().mockResolvedValue({ ok: true, testCallId: 't1', duplicate: false, attachedToLead: false });
    process.env.VOICE_AGENT_SERVICE_KEY = KEY;
  });

  const post = (body: unknown, headers: Record<string, string> = { 'x-voice-agent-key': KEY }) =>
    fetch(`${baseUrl}/api/v1/telephony/voice-agent/call-results`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

  const validBody = { callSid: CALL_SID, outcome: 'CONVERSATION_COMPLETED' };

  it('accepts the correct service key and answers 200', async () => {
    const res = await post(validBody);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, testCallId: 't1', duplicate: false, attachedToLead: false });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing key with 401 and never reaches the service', async () => {
    const res = await post(validBody, {});
    expect(res.status).toBe(401);
    expect(submit).not.toHaveBeenCalled();
  });

  it('rejects a wrong key with 401', async () => {
    const res = await post(validBody, { 'x-voice-agent-key': `${KEY}-wrong` });
    expect(res.status).toBe(401);
    expect(submit).not.toHaveBeenCalled();
  });

  it('a valid DailyOps user JWT (which DOES open user routes) does not open the voice-agent route', async () => {
    const probe = await fetch(`${baseUrl}/api/v1/probe`, { headers: { authorization: `Bearer ${validUserJwt}` } });
    expect(probe.status).toBe(200); // the JWT itself is genuinely valid

    const res = await post(validBody, { authorization: `Bearer ${validUserJwt}` });
    expect(res.status).toBe(401);
    expect(submit).not.toHaveBeenCalled();
  });

  it.each([
    ['unset', undefined],
    ['too short', 'short-key'],
  ])('fails closed with 503 when the backend key is %s', async (_label, value) => {
    if (value === undefined) delete process.env.VOICE_AGENT_SERVICE_KEY;
    else process.env.VOICE_AGENT_SERVICE_KEY = value;
    const res = await post(validBody, { 'x-voice-agent-key': value ?? 'anything' });
    expect(res.status).toBe(503);
    expect(submit).not.toHaveBeenCalled();
  });

  it('does not let the service key open any normal-user (JWT) route', async () => {
    const res = await fetch(`${baseUrl}/api/v1/probe`, { headers: { 'x-voice-agent-key': KEY } });
    expect(res.status).toBe(401);
  });

  it('never echoes the key in an error response', async () => {
    const res = await post(validBody, { 'x-voice-agent-key': `${KEY}-wrong` });
    expect(await res.text()).not.toContain(KEY);
  });

  it.each([
    ['missing callSid', { outcome: 'CONVERSATION_COMPLETED' }],
    ['malformed callSid', { callSid: "x'; DROP TABLE", outcome: 'CONVERSATION_COMPLETED' }],
    ['unknown outcome', { callSid: CALL_SID, outcome: 'QUALIFIED' }],
  ])('rejects %s with 400', async (_label, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(submit).not.toHaveBeenCalled();
  });

  it('passes AI fields through to field-level validation even when invalid, and strips a phone number', async () => {
    const res = await post({ ...validBody, qualification: 'SUPER_HOT', city: 'Pune', from: '+919876543210' });
    expect(res.status).toBe(200);
    const dto = submit.mock.calls[0][0];
    expect(dto.qualification).toBe('SUPER_HOT');
    expect(dto.city).toBe('Pune');
    expect(dto).not.toHaveProperty('from');
  });
});

describe('Voice-agent result endpoint — rate limited before the key check', () => {
  it('answers 429 once the per-IP limit is hit, even with a wrong key', async () => {
    @Module({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 2 }])],
      controllers: [VoiceAgentController],
      providers: [VoiceAgentServiceGuard, { provide: VoiceAgentCallResultService, useValue: { submit: jest.fn() } }],
    })
    class ThrottleTestModule {}
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const app = await NestFactory.create(ThrottleTestModule, { logger: false });
    const prevKey = process.env.VOICE_AGENT_SERVICE_KEY;
    process.env.VOICE_AGENT_SERVICE_KEY = KEY;
    try {
      await app.listen(0, '127.0.0.1');
      const url = `${await app.getUrl()}/api/v1/telephony/voice-agent/call-results`;
      const statuses: number[] = [];
      for (let i = 0; i < 4; i++) {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-voice-agent-key': 'wrong' },
          body: '{}',
        });
        statuses.push(res.status);
      }
      expect(statuses).toEqual([401, 401, 429, 429]);
      // The throttled requests never reached the key check (no extra warnings).
      expect(warn).toHaveBeenCalledTimes(2);
    } finally {
      await app.close();
      warn.mockRestore();
      if (prevKey === undefined) delete process.env.VOICE_AGENT_SERVICE_KEY;
      else process.env.VOICE_AGENT_SERVICE_KEY = prevKey;
    }
  });
});

describe('VoiceAgentServiceGuard — no secret in logs', () => {
  it('logs refusals without the presented or configured key', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const prevKey = process.env.VOICE_AGENT_SERVICE_KEY;
    try {
      const guard = new VoiceAgentServiceGuard();
      process.env.VOICE_AGENT_SERVICE_KEY = KEY;
      const ctx: any = {
        switchToHttp: () => ({ getRequest: () => ({ headers: { 'x-voice-agent-key': 'presented-secret-value' } }) }),
      };
      expect(() => guard.canActivate(ctx)).toThrow();
      const logged = warn.mock.calls.flat().join(' ');
      expect(logged).not.toContain('presented-secret-value');
      expect(logged).not.toContain(KEY);
    } finally {
      warn.mockRestore();
      if (prevKey === undefined) delete process.env.VOICE_AGENT_SERVICE_KEY;
      else process.env.VOICE_AGENT_SERVICE_KEY = prevKey;
    }
  });
});

// ---------------------------------------------------------------------------
// Result service with a mocked Prisma.
// ---------------------------------------------------------------------------

type Call = { id: string; phone: string; leadId: string | null };
type ExplicitLead = { id: string; phone: string; alternatePhone: string | null };

function sqlOf(args: unknown[]): string {
  const strings = args[0] as TemplateStringsArray | string;
  return typeof strings === 'string' ? strings : Array.from(strings).join('?');
}

function buildPrisma(opts: {
  calls: Call[];
  claimCount?: number;
  explicitLead?: ExplicitLead | null;
  phoneMatches?: { id: string }[];
  alreadyLogged?: boolean;
  stored?: { aiResultLeadMatch: string | null; aiResultLeadId: string | null };
  leadCurrent?: Record<string, unknown>;
}) {
  const tx = {
    // Two raw queries exist: the Decision 15 phone match (returns the
    // matching lead ids) and the lead row lock (returns nothing useful).
    $queryRaw: jest.fn((...args: unknown[]) =>
      Promise.resolve(sqlOf(args).includes('regexp_replace') ? (opts.phoneMatches ?? []) : []),
    ),
    telephonyTestCall: {
      updateMany: jest.fn().mockResolvedValue({ count: opts.claimCount ?? 1 }),
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(opts.stored ?? { aiResultLeadMatch: null, aiResultLeadId: null }),
    },
    lead: {
      findFirst: jest.fn().mockResolvedValue(opts.explicitLead ?? null),
      findUniqueOrThrow: jest.fn().mockResolvedValue(
        opts.leadCurrent ?? { city: null, state: null, quantity: null, application: null, timeline: null },
      ),
      update: jest.fn().mockResolvedValue({}),
    },
    leadAiCallLog: {
      findFirst: jest.fn().mockResolvedValue(opts.alreadyLogged ? { id: 'log-0' } : null),
      create: jest.fn().mockResolvedValue({}),
    },
    leadHistory: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    telephonyTestCall: { findMany: jest.fn().mockResolvedValue(opts.calls) },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { prisma, tx };
}

const phoneQueries = (tx: ReturnType<typeof buildPrisma>['tx']) =>
  tx.$queryRaw.mock.calls.filter((args) => sqlOf(args).includes('regexp_replace'));

describe('VoiceAgentCallResultService — correlation by CallSid', () => {
  const call: Call = { id: 'call-1', phone: '+919000000101', leadId: null };
  const body = (extra: Record<string, unknown> = {}) =>
    ({ callSid: CALL_SID, outcome: 'CONVERSATION_COMPLETED', ...extra }) as any;

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterAll(() => jest.restoreAllMocks());

  it('looks the call up by exact CallSid', async () => {
    const { prisma } = buildPrisma({ calls: [call] });
    await new VoiceAgentCallResultService(prisma as any).submit(body());
    expect(prisma.telephonyTestCall.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { providerCallId: CALL_SID } }),
    );
  });

  it('rejects an unknown CallSid with 404 and writes nothing', async () => {
    const { prisma } = buildPrisma({ calls: [] });
    await expect(new VoiceAgentCallResultService(prisma as any).submit(body())).rejects.toMatchObject({ status: 404 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a CallSid matching several calls with 409 and writes nothing', async () => {
    const { prisma } = buildPrisma({ calls: [call, { ...call, id: 'call-2' }] });
    await expect(new VoiceAgentCallResultService(prisma as any).submit(body())).rejects.toMatchObject({ status: 409 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('a different Exotel account id is logged (safely) but does NOT block the result', async () => {
    const prev = process.env.EXOTEL_ACCOUNT_SID;
    process.env.EXOTEL_ACCOUNT_SID = 'ourAccountSid';
    const warn = Logger.prototype.warn as jest.Mock;
    warn.mockClear();
    try {
      const { prisma, tx } = buildPrisma({ calls: [call] });
      const res = await new VoiceAgentCallResultService(prisma as any).submit(body({ accountSid: 'OURACCOUNTSID' }));
      expect(res.duplicate).toBe(false);
      expect(tx.telephonyTestCall.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ aiResult: expect.objectContaining({ accountSidMismatch: true }) }) }),
      );
      const logged = warn.mock.calls.flat().join(' ');
      expect(logged).toContain('equal ignoring case: true');
      expect(logged).not.toContain('ourAccountSid');
      expect(logged).not.toContain('OURACCOUNTSID');
    } finally {
      if (prev === undefined) delete process.env.EXOTEL_ACCOUNT_SID;
      else process.env.EXOTEL_ACCOUNT_SID = prev;
    }
  });

  it('a duplicate writes nothing and reports what the original submission did', async () => {
    const { prisma, tx } = buildPrisma({
      calls: [call],
      claimCount: 0,
      stored: { aiResultLeadMatch: 'SINGLE_MATCH', aiResultLeadId: 'lead-1' },
    });
    const res = await new VoiceAgentCallResultService(prisma as any).submit(body({ qualification: 'HOT' }));
    expect(res).toEqual({ ok: true, testCallId: 'call-1', duplicate: true, leadMatch: 'SINGLE_MATCH', attachedToLead: true });
    expect(phoneQueries(tx)).toHaveLength(0);
    expect(tx.leadAiCallLog.create).not.toHaveBeenCalled();
    expect(tx.lead.update).not.toHaveBeenCalled();
    expect(tx.telephonyTestCall.update).not.toHaveBeenCalled();
  });

  it('a duplicate of a result kept on the test call only reports attachedToLead:false', async () => {
    const { prisma } = buildPrisma({
      calls: [call],
      claimCount: 0,
      stored: { aiResultLeadMatch: 'MULTIPLE_MATCHES', aiResultLeadId: null },
    });
    const res = await new VoiceAgentCallResultService(prisma as any).submit(body());
    expect(res).toMatchObject({ duplicate: true, leadMatch: 'MULTIPLE_MATCHES', attachedToLead: false });
  });

  it('claims the call atomically (conditional on no result yet)', async () => {
    const { prisma, tx } = buildPrisma({ calls: [call] });
    await new VoiceAgentCallResultService(prisma as any).submit(body());
    expect(tx.telephonyTestCall.updateMany).toHaveBeenCalledWith({
      where: { id: 'call-1', aiResultReceivedAt: null },
      data: { aiResultReceivedAt: expect.any(Date) },
    });
  });

  it('reports attachedToLead:false when the lead already had a log for this CallSid (nothing re-written)', async () => {
    const { prisma, tx } = buildPrisma({ calls: [call], phoneMatches: [{ id: 'lead-1' }], alreadyLogged: true });
    const res = await new VoiceAgentCallResultService(prisma as any).submit(body({ qualification: 'HOT' }));
    expect(res).toMatchObject({ duplicate: false, leadMatch: 'SINGLE_MATCH', attachedToLead: false });
    expect(tx.leadAiCallLog.create).not.toHaveBeenCalled();
    expect(tx.telephonyTestCall.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ aiResultLeadId: null }) }),
    );
  });
});

describe('VoiceAgentCallResultService — Decision 15 lead matching', () => {
  const body = { callSid: CALL_SID, outcome: 'CONVERSATION_COMPLETED', qualification: 'WARM' } as any;
  const unlinked = { id: 'c', phone: '+919000000101', leadId: null };
  const linked = { id: 'c', phone: '+919000000101', leadId: 'lead-x' };

  it('normalizes +91 to the stored 10-digit form and matches primary OR alternate phone among active leads', async () => {
    const { prisma, tx } = buildPrisma({ calls: [unlinked], phoneMatches: [{ id: 'lead-1' }] });
    await new VoiceAgentCallResultService(prisma as any).submit(body);
    const [args] = phoneQueries(tx);
    const sql = sqlOf(args);
    expect(sql).toContain('"alternatePhone"');
    expect(sql).toContain('"deletedAt" IS NULL');
    expect(sql).toContain("NOT IN ('WON', 'LOST')");
    expect(sql).toContain('LIMIT 2');
    expect(args.slice(1)).toEqual(['9000000101', '9000000101']);
  });

  it('exactly one active match → attaches to that lead', async () => {
    const { prisma, tx } = buildPrisma({ calls: [unlinked], phoneMatches: [{ id: 'lead-1' }] });
    const res = await new VoiceAgentCallResultService(prisma as any).submit(body);
    expect(res).toMatchObject({ leadMatch: 'SINGLE_MATCH', attachedToLead: true });
    expect(tx.leadAiCallLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ leadId: 'lead-1', externalCallId: CALL_SID }) }),
    );
    expect(tx.telephonyTestCall.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ aiResultLeadMatch: 'SINGLE_MATCH', aiResultLeadId: 'lead-1' }),
      }),
    );
  });

  it.each([
    ['no active match', [], 'NO_MATCH'],
    ['several active matches', [{ id: 'lead-1' }, { id: 'lead-2' }], 'MULTIPLE_MATCHES'],
  ])('%s → result kept on the test call only', async (_label, matches, kind) => {
    const { prisma, tx } = buildPrisma({ calls: [unlinked], phoneMatches: matches });
    const res = await new VoiceAgentCallResultService(prisma as any).submit(body);
    expect(res).toMatchObject({ leadMatch: kind, attachedToLead: false });
    expect(tx.leadAiCallLog.create).not.toHaveBeenCalled();
    expect(tx.lead.update).not.toHaveBeenCalled();
    expect(tx.leadHistory.create).not.toHaveBeenCalled();
    expect(tx.telephonyTestCall.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          aiResultLeadMatch: kind,
          aiResultLeadId: null,
          aiResultOutcome: 'CONVERSATION_COMPLETED',
          aiResult: expect.objectContaining({ qualification: 'WARM' }),
        }),
      }),
    );
  });

  it('an un-normalizable call number never matches anything', async () => {
    const { prisma, tx } = buildPrisma({ calls: [{ id: 'c', phone: '12345', leadId: null }] });
    const res = await new VoiceAgentCallResultService(prisma as any).submit(body);
    expect(res).toMatchObject({ leadMatch: 'NO_MATCH', attachedToLead: false });
    expect(phoneQueries(tx)).toHaveLength(0);
  });

  it.each([
    ['primary phone', { id: 'lead-x', phone: '9000000101', alternatePhone: null }],
    ['primary phone in another format', { id: 'lead-x', phone: '+91 90000 00101', alternatePhone: null }],
    ['alternate phone', { id: 'lead-x', phone: '9888888888', alternatePhone: '09000000101' }],
  ])('explicit lead, active, %s matches the dialled number → that lead, no phone search', async (_label, lead) => {
    const { prisma, tx } = buildPrisma({ calls: [linked], explicitLead: lead });
    const res = await new VoiceAgentCallResultService(prisma as any).submit(body);
    expect(res).toMatchObject({ leadMatch: 'EXPLICIT_LEAD', attachedToLead: true });
    expect(phoneQueries(tx)).toHaveLength(0);
    expect(tx.lead.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-x', deletedAt: null, status: { notIn: ['WON', 'LOST'] } },
      }),
    );
  });

  it("explicit lead whose phones don't match the dialled number → kept on the test call only", async () => {
    const { prisma, tx } = buildPrisma({
      calls: [linked],
      explicitLead: { id: 'lead-x', phone: '9888888888', alternatePhone: '9777777777' },
    });
    const res = await new VoiceAgentCallResultService(prisma as any).submit(body);
    expect(res).toMatchObject({ leadMatch: 'EXPLICIT_LEAD_PHONE_MISMATCH', attachedToLead: false });
    expect(tx.leadAiCallLog.create).not.toHaveBeenCalled();
    expect(tx.lead.update).not.toHaveBeenCalled();
  });

  it('explicit lead that is deleted or closed (WON/LOST) → LEAD_UNAVAILABLE, kept on the test call only', async () => {
    // The lookup itself filters deleted/closed leads, so it finds nothing.
    const { prisma, tx } = buildPrisma({ calls: [linked], explicitLead: null });
    const res = await new VoiceAgentCallResultService(prisma as any).submit(body);
    expect(res).toMatchObject({ leadMatch: 'LEAD_UNAVAILABLE', attachedToLead: false });
    expect(tx.leadAiCallLog.create).not.toHaveBeenCalled();
  });

  it('a voice-agent failure is written as FAILED with no qualification', async () => {
    const { prisma, tx } = buildPrisma({ calls: [unlinked], phoneMatches: [{ id: 'lead-1' }] });
    await new VoiceAgentCallResultService(prisma as any).submit({
      callSid: CALL_SID,
      outcome: 'AGENT_ERROR',
      qualification: 'HOT',
      agentErrors: ['stt'],
    } as any);
    const logData = tx.leadAiCallLog.create.mock.calls[0][0].data;
    expect(logData.status).toBe('FAILED');
    expect(logData.qualification).toBeUndefined();
    const leadData = tx.lead.update.mock.calls[0][0].data;
    expect(leadData.aiStatus).toBe('FAILED');
    expect(leadData).not.toHaveProperty('aiQualification');
  });

  it('never writes Lead status, priority or assignment', async () => {
    const { prisma, tx } = buildPrisma({ calls: [unlinked], phoneMatches: [{ id: 'lead-1' }] });
    await new VoiceAgentCallResultService(prisma as any).submit({ ...body, city: 'Pune', siteVisitRequested: true });
    const leadData = tx.lead.update.mock.calls[0][0].data;
    for (const key of ['status', 'priority', 'assignedToUserId', 'assignedToUser', 'customerId', 'nextFollowUp']) {
      expect(leadData).not.toHaveProperty(key);
    }
  });
});

describe('VoiceAgentCallResultService — logs carry no phone numbers', () => {
  it('logs the test-call id and CallSid, never the phone number', async () => {
    const lines: string[] = [];
    const capture = (...args: unknown[]) => void lines.push(args.map(String).join(' '));
    const spies = (['log', 'warn', 'error'] as const).map((m) =>
      jest.spyOn(Logger.prototype, m).mockImplementation(capture as any),
    );
    try {
      const { prisma } = buildPrisma({
        calls: [{ id: 'call-77', phone: '+919000000177', leadId: null }],
        phoneMatches: [{ id: 'lead-1' }],
      });
      await new VoiceAgentCallResultService(prisma as any).submit({
        callSid: CALL_SID,
        outcome: 'CONVERSATION_COMPLETED',
        qualification: 'NOPE',
      } as any);
      const { prisma: unknownPrisma } = buildPrisma({ calls: [] });
      await new VoiceAgentCallResultService(unknownPrisma as any)
        .submit({ callSid: CALL_SID, outcome: 'AGENT_ERROR' } as any)
        .catch(() => undefined);
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
    const text = lines.join('\n');
    expect(text).toContain('call-77');
    expect(text).toContain(CALL_SID);
    expect(text).not.toMatch(/9000000177/);
  });
});
