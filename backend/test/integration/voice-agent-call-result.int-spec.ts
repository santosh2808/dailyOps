import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { VoiceAgentCallResultService, VOICE_AGENT_ACTOR } from '../../src/telephony/voice-agent-call-result.service';
import * as aiCallResult from '../../src/leads/ai-call-result';
import { LeadsService } from '../../src/leads/leads.service';

// D.O.T. call-result write-back (Phase 0) against real Postgres: the
// transaction, row locks and conditional-update idempotency the unit tests
// can only mock. WRITES (and removes) rows, so — like jeo-numbering — the
// database name itself must contain "test"; a developer's own database is
// never used. No telephony, Sarvam, email or WhatsApp code runs here: the
// service only reads/writes the database.
const url = process.env.DATABASE_URL;
const dbName = url ? new URL(url).pathname.replace(/^\//, '') : '';
const describeDb = /test/i.test(dbName) ? describe : describe.skip;

// Obviously-synthetic numbers in a disposable database; nothing is dialled.
const PHONE = {
  single: '9000000101',
  none: '9000000102',
  multiple: '9000000103',
  activeAndClosed: '9000000104',
  substring: '9000000105',
  agentError: '9000000106',
  rollback: '9000000107',
  concurrent: '9000000108',
  manualLog: '9000000109',
  alternate: '9000000110',
  formatted: '9000000111',
  primaryVsAlternate: '9000000112',
  explicitMismatch: '9000000113',
  explicitClosed: '9000000114',
  explicitAlternate: '9000000115',
  accountMismatch: '9000000116',
  otherNumber: '9000000199',
};

describeDb('Voice-agent call result write-back (real database)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const service = new VoiceAgentCallResultService(prisma as any);
  const runTag = randomUUID().slice(0, 8);
  const leadIds: string[] = [];
  const callIds: string[] = [];
  let userId: string;
  let seq = 0;

  const newLead = async (data: Record<string, unknown>) => {
    seq += 1;
    const lead = await prisma.lead.create({
      data: {
        leadNumber: `LD-VA-${runTag}-${seq}`,
        companyName: `VA Test Co ${seq}`,
        contactPerson: 'Test Contact',
        title: 'Voice-agent write-back test',
        phone: PHONE.single,
        ...data,
      } as any,
    });
    leadIds.push(lead.id);
    return lead;
  };

  const newCall = async (phone10: string, leadId: string | null = null) => {
    const sid = `SIMULATED${runTag}${++seq}`;
    const call = await prisma.telephonyTestCall.create({
      data: { phone: `+91${phone10}`, leadId, status: 'COMPLETED', providerCallId: sid },
    });
    callIds.push(call.id);
    return { call, sid };
  };

  beforeAll(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const user = await prisma.user.create({
      data: {
        name: 'VA Test Salesperson',
        email: `va-${runTag}@example.invalid`,
        username: `va-${runTag}`,
        password: 'not-a-real-hash',
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.telephonyTestCall.deleteMany({ where: { id: { in: callIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } }); // cascades call logs + history
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
    jest.restoreAllMocks();
  });

  it('single active match: fills empty fields, keeps existing ones, stores conflicts as suggestions, preserves status/priority/assignment', async () => {
    const lead = await newLead({
      phone: PHONE.single,
      status: 'ASSIGNED',
      priority: 'HIGH',
      assignedToUserId: userId,
      city: 'Pune',
      state: null,
      quantity: null,
      application: 'Factory floor',
    });
    const { call, sid } = await newCall(PHONE.single);

    const res = await service.submit({
      callSid: sid,
      outcome: 'CONVERSATION_COMPLETED',
      qualification: 'WARM',
      summary: 'Needs fans for a warehouse.',
      city: 'Hyderabad', // conflicts with Pune → suggestion
      state: 'telangana', // empty → filled (canonical spelling)
      quantity: 8, // empty → filled
      application: 'factory  FLOOR', // same value → no-op
      startedAt: '2026-11-07T05:00:00Z',
      endedAt: '2026-11-07T05:02:00Z',
    } as any);

    expect(res).toMatchObject({ duplicate: false, leadMatch: 'SINGLE_MATCH', attachedToLead: true, rejectedFields: [] });

    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after.city).toBe('Pune');
    expect(after.state).toBe('Telangana');
    expect(after.quantity).toBe(8);
    expect(after.application).toBe('Factory floor');
    expect(after.status).toBe('ASSIGNED');
    expect(after.priority).toBe('HIGH');
    expect(after.assignedToUserId).toBe(userId);
    expect(after.aiStatus).toBe('QUALIFIED');
    expect(after.aiQualification).toBe('WARM');
    expect(after.aiSummary).toBe('Needs fans for a warehouse.');
    expect(after.aiCallAttempts).toBe(1);

    const logs = await prisma.leadAiCallLog.findMany({ where: { leadId: lead.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ externalCallId: sid, status: 'QUALIFIED', durationSeconds: 120, performedBy: VOICE_AGENT_ACTOR });
    expect(logs[0].fieldSuggestions).toEqual([{ field: 'city', aiValue: 'Hyderabad', leadValue: 'Pune' }]);

    const history = await prisma.leadHistory.findMany({ where: { leadId: lead.id } });
    expect(history).toHaveLength(1);
    expect(history[0].action).toBe('AI_CALL_LOGGED');
    expect(history[0].description).toContain('filled empty state, quantity (8)');
    expect(history[0].description).toContain('were NOT applied — kept as suggestions (city)');
    expect(history[0].description).not.toMatch(/Hyderabad/);

    const notes = await prisma.leadNote.count({ where: { leadId: lead.id } });
    expect(notes).toBe(0); // AI output never dumped into Lead Notes

    const savedCall = await prisma.telephonyTestCall.findUniqueOrThrow({ where: { id: call.id } });
    expect(savedCall).toMatchObject({ aiResultOutcome: 'CONVERSATION_COMPLETED', aiResultLeadMatch: 'SINGLE_MATCH', aiResultLeadId: lead.id });
    expect(savedCall.aiResultReceivedAt).not.toBeNull();
    // The Telephony Test page's own lead link is untouched.
    expect(savedCall.leadId).toBeNull();

    // Same result delivered again (voice-agent retry): nothing changes.
    const again = await service.submit({ callSid: sid, outcome: 'CONVERSATION_COMPLETED', qualification: 'HOT', city: 'Mumbai' } as any);
    expect(again).toEqual({ ok: true, testCallId: call.id, duplicate: true, leadMatch: 'SINGLE_MATCH', attachedToLead: true });
    expect(await prisma.leadAiCallLog.count({ where: { leadId: lead.id } })).toBe(1);
    expect(await prisma.leadHistory.count({ where: { leadId: lead.id } })).toBe(1);
    const afterRetry = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(afterRetry.aiCallAttempts).toBe(1);
    expect(afterRetry.aiQualification).toBe('WARM');
  });

  it('concurrent duplicate deliveries record exactly one result', async () => {
    const lead = await newLead({ phone: PHONE.concurrent });
    const { sid } = await newCall(PHONE.concurrent);
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        service.submit({ callSid: sid, outcome: 'CONVERSATION_COMPLETED', qualification: 'COLD' } as any),
      ),
    );
    expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
    expect(await prisma.leadAiCallLog.count({ where: { leadId: lead.id } })).toBe(1);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).aiCallAttempts).toBe(1);
  });

  it('no active match: result kept on the test call only', async () => {
    const { call, sid } = await newCall(PHONE.none);
    const res = await service.submit({ callSid: sid, outcome: 'CONVERSATION_COMPLETED', qualification: 'HOT', summary: 'S' } as any);
    expect(res).toMatchObject({ leadMatch: 'NO_MATCH', attachedToLead: false });
    const saved = await prisma.telephonyTestCall.findUniqueOrThrow({ where: { id: call.id } });
    expect(saved.aiResultLeadId).toBeNull();
    expect(saved.aiResult).toMatchObject({ outcome: 'CONVERSATION_COMPLETED', qualification: 'HOT', summary: 'S' });
    expect(await prisma.leadAiCallLog.count({ where: { externalCallId: sid } })).toBe(0);
  });

  it('several active matches: never picks one — kept on the test call only', async () => {
    const older = await newLead({ phone: PHONE.multiple });
    const newer = await newLead({ phone: PHONE.multiple });
    const { sid } = await newCall(PHONE.multiple);
    const res = await service.submit({ callSid: sid, outcome: 'CONVERSATION_COMPLETED', qualification: 'HOT' } as any);
    expect(res).toMatchObject({ leadMatch: 'MULTIPLE_MATCHES', attachedToLead: false });
    for (const id of [older.id, newer.id]) {
      const l = await prisma.lead.findUniqueOrThrow({ where: { id } });
      expect(l.aiCallAttempts).toBe(0);
      expect(l.aiStatus).toBe('NOT_STARTED');
    }
  });

  it('WON, LOST and deleted leads are not "active": one remaining active lead is the single match', async () => {
    await newLead({ phone: PHONE.activeAndClosed, status: 'WON' });
    await newLead({ phone: PHONE.activeAndClosed, status: 'LOST' });
    await newLead({ phone: PHONE.activeAndClosed, deletedAt: new Date() });
    const active = await newLead({ phone: PHONE.activeAndClosed, status: 'NEW' });
    const { sid } = await newCall(PHONE.activeAndClosed);
    const res = await service.submit({ callSid: sid, outcome: 'NO_CONVERSATION' } as any);
    expect(res).toMatchObject({ leadMatch: 'SINGLE_MATCH', attachedToLead: true });
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: active.id } });
    expect(l.aiStatus).toBe('ANSWERED');
    expect(l.aiQualification).toBeNull();
  });

  it('exact phone match only: a lead whose number merely contains / is contained in the call number does not match', async () => {
    await newLead({ phone: PHONE.substring.slice(1) }); // 9 digits, a substring
    await newLead({ phone: `${PHONE.substring}9` }); // 11 digits, a superstring
    const { sid } = await newCall(PHONE.substring);
    const res = await service.submit({ callSid: sid, outcome: 'NO_CONVERSATION' } as any);
    expect(res).toMatchObject({ leadMatch: 'NO_MATCH' });
  });

  it('agent/Sarvam failure: lead shows FAILED, no qualification, AI fields rejected', async () => {
    const lead = await newLead({ phone: PHONE.agentError, aiQualification: null });
    const { call, sid } = await newCall(PHONE.agentError);
    const res = await service.submit({
      callSid: sid,
      outcome: 'AGENT_ERROR',
      agentErrors: ['stt'],
      qualification: 'COLD',
      city: 'Chennai',
    } as any);
    expect(res.rejectedFields?.sort()).toEqual(['city', 'qualification']);
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(l.aiStatus).toBe('FAILED');
    expect(l.aiQualification).toBeNull();
    expect(l.city).toBeNull();
    const saved = await prisma.telephonyTestCall.findUniqueOrThrow({ where: { id: call.id } });
    expect(saved.aiResultOutcome).toBe('AGENT_ERROR');
    expect((saved.aiResult as any).agentErrors).toEqual(['stt']);
  });

  it('partial failure rolls everything back, so a retry can succeed', async () => {
    const lead = await newLead({ phone: PHONE.rollback });
    const { call, sid } = await newCall(PHONE.rollback);
    const spy = jest.spyOn(aiCallResult, 'writeAiCallResultToLead').mockRejectedValueOnce(new Error('simulated failure'));
    await expect(service.submit({ callSid: sid, outcome: 'CONVERSATION_COMPLETED', qualification: 'HOT' } as any)).rejects.toThrow(
      'simulated failure',
    );
    spy.mockRestore();

    const untouched = await prisma.telephonyTestCall.findUniqueOrThrow({ where: { id: call.id } });
    expect(untouched.aiResultReceivedAt).toBeNull(); // claim rolled back
    expect(await prisma.leadAiCallLog.count({ where: { leadId: lead.id } })).toBe(0);

    const retry = await service.submit({ callSid: sid, outcome: 'CONVERSATION_COMPLETED', qualification: 'HOT' } as any);
    expect(retry).toMatchObject({ duplicate: false, attachedToLead: true });
    expect(await prisma.leadAiCallLog.count({ where: { leadId: lead.id } })).toBe(1);
  });

  it('the existing POST /leads/:id/ai-call-history path now also fills empty fields only', async () => {
    // Any attempt to use an outbound service (email, WhatsApp, storage,
    // notifications) fails the test.
    const forbidden = new Proxy({}, { get: (_t, prop) => { throw new Error(`outbound service used: ${String(prop)}`); } });
    const leads = new LeadsService(prisma as any, forbidden as any, forbidden as any, forbidden as any, forbidden as any);
    const lead = await newLead({ phone: PHONE.manualLog, city: 'Pune', state: 'Maharashtra', quantity: null, status: 'CONTACTED', priority: 'URGENT' });

    const updated = await leads.addAiCallLog(
      lead.id,
      { status: 'QUALIFIED', qualification: 'HOT', city: 'Hyderabad', state: 'Telangana', quantity: 5 } as any,
      'Tester',
    );
    expect(updated.city).toBe('Pune');
    expect(updated.state).toBe('Maharashtra');
    expect(updated.quantity).toBe(5);
    expect(updated.status).toBe('CONTACTED');
    expect(updated.priority).toBe('URGENT');
    const log = await prisma.leadAiCallLog.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(log.fieldSuggestions).toEqual([
      { field: 'city', aiValue: 'Hyderabad', leadValue: 'Pune' },
      { field: 'state', aiValue: 'Telangana', leadValue: 'Maharashtra' },
    ]);
  });

  it('Decision 15 checks the ALTERNATE phone too: a lead matching only by alternate phone is the single match', async () => {
    const lead = await newLead({ phone: PHONE.otherNumber, alternatePhone: PHONE.alternate });
    const { sid } = await newCall(PHONE.alternate);
    const res = await service.submit({ callSid: sid, outcome: 'NO_CONVERSATION' } as any);
    expect(res).toMatchObject({ leadMatch: 'SINGLE_MATCH', attachedToLead: true });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).aiCallAttempts).toBe(1);
  });

  it('finds numbers stored in other formats the app has written (+91 with spaces, leading 0)', async () => {
    const lead = await newLead({ phone: `+91 ${PHONE.formatted.slice(0, 5)} ${PHONE.formatted.slice(5)}` });
    const { sid } = await newCall(PHONE.formatted);
    const res = await service.submit({ callSid: sid, outcome: 'NO_CONVERSATION' } as any);
    expect(res).toMatchObject({ leadMatch: 'SINGLE_MATCH', attachedToLead: true });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).aiCallAttempts).toBe(1);
  });

  it('one lead by primary phone + another by alternate phone = ambiguous → kept on the test call only', async () => {
    const a = await newLead({ phone: PHONE.primaryVsAlternate });
    const b = await newLead({ phone: PHONE.otherNumber, alternatePhone: `0${PHONE.primaryVsAlternate}` });
    const { sid } = await newCall(PHONE.primaryVsAlternate);
    const res = await service.submit({ callSid: sid, outcome: 'CONVERSATION_COMPLETED', qualification: 'HOT' } as any);
    expect(res).toMatchObject({ leadMatch: 'MULTIPLE_MATCHES', attachedToLead: false });
    for (const id of [a.id, b.id]) {
      expect((await prisma.lead.findUniqueOrThrow({ where: { id } })).aiCallAttempts).toBe(0);
    }
  });

  it('explicit lead whose phones do not match the dialled number → kept on the test call only', async () => {
    const lead = await newLead({ phone: PHONE.otherNumber });
    const { call, sid } = await newCall(PHONE.explicitMismatch, lead.id);
    const res = await service.submit({ callSid: sid, outcome: 'CONVERSATION_COMPLETED', qualification: 'HOT' } as any);
    expect(res).toMatchObject({ leadMatch: 'EXPLICIT_LEAD_PHONE_MISMATCH', attachedToLead: false });
    expect(await prisma.leadAiCallLog.count({ where: { leadId: lead.id } })).toBe(0);
    const saved = await prisma.telephonyTestCall.findUniqueOrThrow({ where: { id: call.id } });
    expect(saved.leadId).toBe(lead.id); // the page's own link is untouched
    expect(saved.aiResultLeadId).toBeNull();
  });

  it('explicit lead that is closed (LOST) → LEAD_UNAVAILABLE, kept on the test call only', async () => {
    const lead = await newLead({ phone: PHONE.explicitClosed, status: 'LOST' });
    const { sid } = await newCall(PHONE.explicitClosed, lead.id);
    const res = await service.submit({ callSid: sid, outcome: 'NO_CONVERSATION' } as any);
    expect(res).toMatchObject({ leadMatch: 'LEAD_UNAVAILABLE', attachedToLead: false });
    expect(await prisma.leadAiCallLog.count({ where: { leadId: lead.id } })).toBe(0);
  });

  it('explicit lead matched by its alternate phone → that lead', async () => {
    const lead = await newLead({ phone: PHONE.otherNumber, alternatePhone: PHONE.explicitAlternate });
    const { sid } = await newCall(PHONE.explicitAlternate, lead.id);
    const res = await service.submit({ callSid: sid, outcome: 'NO_CONVERSATION' } as any);
    expect(res).toMatchObject({ leadMatch: 'EXPLICIT_LEAD', attachedToLead: true });
  });

  it('an Exotel account-id mismatch is recorded but does not block the result; callback time without offset is IST', async () => {
    const prev = process.env.EXOTEL_ACCOUNT_SID;
    process.env.EXOTEL_ACCOUNT_SID = 'SIMULATEDaccount';
    try {
      const lead = await newLead({ phone: PHONE.accountMismatch });
      const { call, sid } = await newCall(PHONE.accountMismatch);
      const callbackLocal = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) + 'T17:00:00';
      const res = await service.submit({
        callSid: sid,
        accountSid: 'simulatedACCOUNT',
        outcome: 'CONVERSATION_COMPLETED',
        callbackRequested: true,
        callbackAt: callbackLocal,
      } as any);
      expect(res).toMatchObject({ duplicate: false, attachedToLead: true, rejectedFields: [] });
      const saved = await prisma.telephonyTestCall.findUniqueOrThrow({ where: { id: call.id } });
      expect((saved.aiResult as any).accountSidMismatch).toBe(true);
      const l = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(l.aiCallbackAt?.toISOString()).toBe(new Date(`${callbackLocal}+05:30`).toISOString());
    } finally {
      if (prev === undefined) delete process.env.EXOTEL_ACCOUNT_SID;
      else process.env.EXOTEL_ACCOUNT_SID = prev;
    }
  });

  it('unknown CallSid writes nothing', async () => {
    await expect(service.submit({ callSid: `SIMULATEDunknown${runTag}`, outcome: 'NO_CONVERSATION' } as any)).rejects.toMatchObject({
      status: 404,
    });
  });
});
