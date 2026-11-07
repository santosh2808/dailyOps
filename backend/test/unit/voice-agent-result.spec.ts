import { leadAiStatusFor, sanitizeVoiceAgentResult } from '../../src/telephony/voice-agent-result';
import { planLeadFieldMerge } from '../../src/leads/ai-call-result';

// D.O.T. call-result write-back (Phase 0) — pure validation / mapping /
// merge rules. No database, no network.

// Fixed "now" so date rules never depend on when the suite runs.
const NOW = new Date('2026-11-07T06:00:00.000Z'); // 11:30 IST

describe('sanitizeVoiceAgentResult — each field validated on its own', () => {
  const completed = (extra: Record<string, unknown> = {}) =>
    sanitizeVoiceAgentResult({ outcome: 'CONVERSATION_COMPLETED', ...extra } as any, NOW);

  it('keeps every valid field of a completed conversation', () => {
    const { result, rejected } = completed({
      qualification: 'warm',
      summary: '  Needs 8 fans for a warehouse.  ',
      quantity: 8,
      application: 'Warehouse',
      timeline: 'Within 3 months',
      city: 'Hyderabad',
      state: 'telangana',
      siteVisitRequested: true,
      callbackRequested: false,
      callbackAt: '2026-11-20T10:30:00+05:30',
    });
    expect(rejected).toEqual([]);
    expect(result).toMatchObject({
      qualification: 'WARM',
      summary: 'Needs 8 fans for a warehouse.',
      quantity: 8,
      application: 'Warehouse',
      timeline: 'Within 3 months',
      city: 'Hyderabad',
      state: 'Telangana', // canonical spelling
      siteVisitRequested: true,
      callbackRequested: false,
      callbackAt: '2026-11-20T05:00:00.000Z',
    });
  });

  it('drops an invalid qualification WITHOUT rejecting the unrelated valid fields', () => {
    const { result, rejected } = completed({ qualification: 'SUPER_HOT', city: 'Pune', quantity: 4 });
    expect(result.qualification).toBeUndefined();
    expect(result.city).toBe('Pune');
    expect(result.quantity).toBe(4);
    expect(rejected).toEqual([expect.objectContaining({ field: 'qualification', value: 'SUPER_HOT' })]);
  });

  it('never turns an unknown qualification into COLD', () => {
    expect(completed({ qualification: 'maybe' }).result.qualification).toBeUndefined();
    expect(completed({ qualification: 42 }).result.qualification).toBeUndefined();
  });

  it.each([
    ['state', 'Atlantis', 'not a recognised Indian state'],
    ['quantity', 'five', 'whole number'],
    ['quantity', 0, 'whole number'],
    ['quantity', 2.5, 'whole number'],
    ['callbackAt', 'tomorrow 5pm', 'ISO 8601'],
    ['callbackAt', '2026', 'ISO 8601'],
    ['siteVisitRequested', 'yes', 'true or false'],
    ['city', { name: 'Pune' }, 'must be text'],
    ['application', 'x'.repeat(201), 'longer than 200'],
  ])('rejects %s=%p and keeps the rest', (field, value, reason) => {
    const { result, rejected } = completed({ [field]: value, timeline: 'Q1' });
    expect((result as any)[field]).toBeUndefined();
    expect(result.timeline).toBe('Q1');
    expect(rejected).toHaveLength(1);
    expect(rejected[0].field).toBe(field);
    expect(rejected[0].reason).toContain(reason);
  });

  describe('callbackAt (M3: India time, no past dates)', () => {
    const cb = (value: unknown) => completed({ callbackAt: value });

    it('reads a time without a timezone as IST (+05:30), not server/UTC time', () => {
      expect(cb('2026-11-08T17:00:00').result.callbackAt).toBe('2026-11-08T11:30:00.000Z');
      expect(cb('2026-11-08 17:00').result.callbackAt).toBe('2026-11-08T11:30:00.000Z');
    });

    it('keeps an explicitly supplied offset', () => {
      expect(cb('2026-11-08T17:00:00Z').result.callbackAt).toBe('2026-11-08T17:00:00.000Z');
      expect(cb('2026-11-08T17:00:00+04:00').result.callbackAt).toBe('2026-11-08T13:00:00.000Z');
      expect(cb('2026-11-08T17:00:00.000+05:30').result.callbackAt).toBe('2026-11-08T11:30:00.000Z');
    });

    it.each([
      ['a past time', '2026-11-07T09:00:00', 'in the past'],
      ['a past year', '2025-11-08T17:00:00+05:30', 'in the past'],
      ['a date without a time', '2026-11-08', 'must include a time'],
      ['more than a year ahead', '2028-01-01T10:00:00+05:30', 'more than a year ahead'],
      ['an impossible date', '2026-02-30T10:00:00', 'ISO 8601'],
      ['free text', 'next Monday', 'ISO 8601'],
    ])('rejects %s and keeps the other fields', (_label, value, reason) => {
      const { result, rejected } = completed({ callbackAt: value, city: 'Pune' });
      expect(result.callbackAt).toBeUndefined();
      expect(result.city).toBe('Pune');
      expect(rejected).toEqual([expect.objectContaining({ field: 'callbackAt', reason: expect.stringContaining(reason) })]);
    });

    it('allows a time a few minutes ago (clock skew / "call me now")', () => {
      expect(cb('2026-11-07T11:27:00').result.callbackAt).toBe('2026-11-07T05:57:00.000Z');
    });
  });

  it('accepts a numeric-string quantity and truncates an over-long summary instead of rejecting it', () => {
    const { result, rejected } = completed({ quantity: ' 12 ', summary: 'a'.repeat(2500) });
    expect(result.quantity).toBe(12);
    expect(result.summary).toHaveLength(2001); // 2000 chars + ellipsis
    expect(rejected).toEqual([]);
  });

  it('truncates the preview of a rejected value', () => {
    const { rejected } = completed({ state: 'z'.repeat(500) });
    expect(rejected[0].value!.length).toBeLessThanOrEqual(101);
  });

  it.each(['AGENT_ERROR', 'NO_CONVERSATION'] as const)(
    'accepts NO AI fields when the outcome is %s (technical failure is never qualified)',
    (outcome) => {
      const { result, rejected } = sanitizeVoiceAgentResult({
        outcome,
        qualification: 'HOT',
        summary: 'should not be stored',
        city: 'Pune',
        siteVisitRequested: true,
        startedAt: '2026-11-07T05:00:00.000Z',
        endedAt: '2026-11-07T05:01:30.000Z',
      } as any);
      expect(result.qualification).toBeUndefined();
      expect(result.summary).toBeUndefined();
      expect(result.city).toBeUndefined();
      expect(result.siteVisitRequested).toBeUndefined();
      expect(rejected.map((r) => r.field).sort()).toEqual(['city', 'qualification', 'siteVisitRequested', 'summary']);
      // Call metadata is still kept.
      expect(result.durationSeconds).toBe(90);
    },
  );

  it('computes duration from start/end and keeps only known agent-error components', () => {
    const { result } = sanitizeVoiceAgentResult({
      outcome: 'AGENT_ERROR',
      startedAt: '2026-11-07T05:00:00Z',
      endedAt: '2026-11-07T05:00:42Z',
      agentErrors: ['stt', 'stt', 'llm', 'rm -rf', 7],
    } as any);
    expect(result.durationSeconds).toBe(42);
    expect(result.agentErrors).toEqual(['stt', 'llm']);
  });

  it('rejects a bad duration but keeps the timestamps', () => {
    const { result, rejected } = sanitizeVoiceAgentResult({
      outcome: 'NO_CONVERSATION',
      startedAt: '2026-11-07T05:00:00Z',
      durationSeconds: -5,
    } as any);
    expect(result.startedAt).toBe('2026-11-07T05:00:00.000Z');
    expect(result.durationSeconds).toBeUndefined();
    expect(rejected.map((r) => r.field)).toEqual(['durationSeconds']);
  });
});

describe('leadAiStatusFor — call outcome vs AI qualification', () => {
  const s = (outcome: any, qualification?: any) => leadAiStatusFor({ outcome, qualification, agentErrors: [] });

  it('reports a voice-agent/Sarvam failure as FAILED — never ANSWERED or QUALIFIED', () => {
    expect(s('AGENT_ERROR')).toBe('FAILED');
    expect(s('AGENT_ERROR', 'HOT')).toBe('FAILED');
  });
  it('reports a silent connected call as ANSWERED', () => {
    expect(s('NO_CONVERSATION')).toBe('ANSWERED');
  });
  it('reports a completed conversation by its qualification', () => {
    expect(s('CONVERSATION_COMPLETED', 'HOT')).toBe('QUALIFIED');
    expect(s('CONVERSATION_COMPLETED', 'COLD')).toBe('QUALIFIED');
    expect(s('CONVERSATION_COMPLETED', 'NOT_INTERESTED')).toBe('NOT_INTERESTED');
  });
  it('reports a completed conversation with no valid qualification as ANSWERED (not a guessed COLD)', () => {
    expect(s('CONVERSATION_COMPLETED')).toBe('ANSWERED');
  });
});

describe('planLeadFieldMerge — AI fills empty fields only', () => {
  it('fills empty (null, undefined, blank) lead fields', () => {
    const { fill, suggestions } = planLeadFieldMerge(
      { city: null, state: '  ', quantity: null, application: undefined, timeline: '' },
      { city: 'Hyderabad', state: 'Telangana', quantity: 8, application: 'Warehouse', timeline: 'Q1' },
    );
    expect(fill).toEqual({ city: 'Hyderabad', state: 'Telangana', quantity: 8, application: 'Warehouse', timeline: 'Q1' });
    expect(suggestions).toEqual([]);
  });

  it('never overwrites an existing value — a conflicting AI value becomes a suggestion', () => {
    const { fill, suggestions } = planLeadFieldMerge(
      { city: 'Pune', state: 'Maharashtra', quantity: 4, application: null, timeline: null },
      { city: 'Hyderabad', state: 'Telangana', quantity: 8 },
    );
    expect(fill).toEqual({});
    expect(suggestions).toEqual([
      { field: 'city', aiValue: 'Hyderabad', leadValue: 'Pune' },
      { field: 'state', aiValue: 'Telangana', leadValue: 'Maharashtra' },
      { field: 'quantity', aiValue: 8, leadValue: 4 },
    ]);
  });

  it('treats the same value (case/whitespace aside) as no conflict', () => {
    const { fill, suggestions } = planLeadFieldMerge(
      { city: 'New  Delhi', quantity: 8 },
      { city: 'new delhi', quantity: 8 },
    );
    expect(fill).toEqual({});
    expect(suggestions).toEqual([]);
  });

  it('ignores AI fields that are empty', () => {
    const { fill, suggestions } = planLeadFieldMerge({ city: null }, { city: '   ', quantity: undefined });
    expect(fill).toEqual({});
    expect(suggestions).toEqual([]);
  });
});
