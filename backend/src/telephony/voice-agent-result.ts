import { AiLeadStatus, AiQualification, VoiceAgentCallOutcome } from '@prisma/client';
import { INDIA_STATES } from '../common/india-states';

// D.O.T. call-result write-back (Phase 0) — field-by-field validation of a
// result the voice-agent submits. Pure (no I/O) so it can be unit tested
// exhaustively.
//
// The AI-extracted fields come from an LLM, so ONE bad value (a misspelt
// state, "five" for a quantity, "tomorrow 5pm" for a date) must never make
// the whole submission fail — that is exactly how results used to be
// dropped. Each field is validated on its own: a valid value is kept, an
// invalid one is left out and recorded in `rejected` with the reason.
//
// Call outcome and AI qualification stay separate: only a completed
// conversation may carry AI fields at all. A technical failure is never
// turned into a qualification.

export const AI_QUALIFICATION_VALUES: readonly AiQualification[] = ['HOT', 'WARM', 'COLD', 'NOT_INTERESTED'];
export const AGENT_ERROR_COMPONENTS = ['stt', 'llm', 'tts', 'agent'] as const;

const MAX_SUMMARY_LENGTH = 2000;
const MAX_SHORT_TEXT_LENGTH = 200;
const MAX_QUANTITY = 100_000;
const MAX_DURATION_SECONDS = 24 * 60 * 60;
const MAX_REJECTED_VALUE_PREVIEW = 100;
// Callback times are spoken by Indian customers: a time without an explicit
// offset means India time. An explicit offset ("Z", "+05:30", ...) is kept.
export const CALLBACK_DEFAULT_OFFSET = '+05:30';
// Small allowance for clock skew / a time "right now" said during the call.
const CALLBACK_PAST_GRACE_MS = 5 * 60 * 1000;
const CALLBACK_MAX_AHEAD_MS = 365 * 24 * 60 * 60 * 1000;

// Fields that only make sense when Meera actually had a conversation.
const AI_FIELDS = [
  'qualification',
  'summary',
  'quantity',
  'application',
  'timeline',
  'city',
  'state',
  'siteVisitRequested',
  'callbackRequested',
  'callbackAt',
] as const;

export interface RawVoiceAgentResult {
  outcome: VoiceAgentCallOutcome;
  qualification?: unknown;
  summary?: unknown;
  quantity?: unknown;
  application?: unknown;
  timeline?: unknown;
  city?: unknown;
  state?: unknown;
  siteVisitRequested?: unknown;
  callbackRequested?: unknown;
  callbackAt?: unknown;
  startedAt?: unknown;
  endedAt?: unknown;
  durationSeconds?: unknown;
  agentErrors?: unknown;
}

export interface SanitizedVoiceAgentResult {
  outcome: VoiceAgentCallOutcome;
  qualification?: AiQualification;
  summary?: string;
  quantity?: number;
  application?: string;
  timeline?: string;
  city?: string;
  state?: string;
  siteVisitRequested?: boolean;
  callbackRequested?: boolean;
  callbackAt?: string;
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  agentErrors: string[];
}

export interface RejectedField {
  field: string;
  reason: string;
  // Short, truncated preview of what was received, for troubleshooting.
  // Never a phone number: no phone field is accepted on this payload.
  value?: string;
}

function preview(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  let text: string;
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  return text.length > MAX_REJECTED_VALUE_PREVIEW ? `${text.slice(0, MAX_REJECTED_VALUE_PREVIEW)}…` : text;
}

function present(value: unknown): boolean {
  return value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === '');
}

function shortText(value: unknown): { ok: true; value: string } | { ok: false; reason: string } {
  if (typeof value !== 'string') return { ok: false, reason: 'must be text' };
  const text = value.trim().replace(/\s+/g, ' ');
  if (text.length > MAX_SHORT_TEXT_LENGTH) return { ok: false, reason: `longer than ${MAX_SHORT_TEXT_LENGTH} characters` };
  return { ok: true, value: text };
}

const HAS_EXPLICIT_OFFSET = /(?:z|[+-]\d{2}:?\d{2})$/i;
const DATE_AND_TIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

function isoDate(
  value: unknown,
  options: { defaultOffset?: string; requireTime?: boolean } = {},
): { ok: true; value: string } | { ok: false; reason: string } {
  const invalid = { ok: false as const, reason: 'must be an ISO 8601 date-time' };
  if (typeof value !== 'string') return invalid;
  let text = value.trim();
  // Require at least a full calendar date — rejects "5pm", "tomorrow",
  // bare years and other strings Date() would half-accept.
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!ymd) return invalid;
  // JavaScript silently rolls impossible dates over ("2026-02-30" becomes
  // 2 March) — require a real calendar date instead.
  const [year, month, day] = [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])];
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) {
    return invalid;
  }
  if (options.requireTime && !DATE_AND_TIME.test(text)) {
    return { ok: false, reason: 'must include a time, not just a date' };
  }
  // A date-time with no offset would otherwise be read in the SERVER's time
  // zone (UTC on AWS) — 5h30m off for an Indian customer.
  if (options.defaultOffset && DATE_AND_TIME.test(text) && !HAS_EXPLICIT_OFFSET.test(text)) {
    text = `${text.replace(' ', 'T')}${options.defaultOffset}`;
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return invalid;
  return { ok: true, value: date.toISOString() };
}

function matchIndiaState(value: string): string | undefined {
  const normalized = value.trim().toLowerCase();
  return INDIA_STATES.find((s) => s.toLowerCase() === normalized);
}

// `now` is injectable for tests; callback times are checked against it.
export function sanitizeVoiceAgentResult(
  raw: RawVoiceAgentResult,
  now: Date = new Date(),
): {
  result: SanitizedVoiceAgentResult;
  rejected: RejectedField[];
} {
  const rejected: RejectedField[] = [];
  const result: SanitizedVoiceAgentResult = { outcome: raw.outcome, agentErrors: [] };
  const reject = (field: string, reason: string, value?: unknown) =>
    rejected.push({ field, reason, value: preview(value) });

  // --- Call metadata (accepted for every outcome) ----------------------
  if (present(raw.startedAt)) {
    const d = isoDate(raw.startedAt);
    if (d.ok) result.startedAt = d.value;
    else reject('startedAt', d.reason, raw.startedAt);
  }
  if (present(raw.endedAt)) {
    const d = isoDate(raw.endedAt);
    if (d.ok) result.endedAt = d.value;
    else reject('endedAt', d.reason, raw.endedAt);
  }
  if (present(raw.durationSeconds)) {
    const n = raw.durationSeconds;
    if (typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_DURATION_SECONDS) {
      result.durationSeconds = n;
    } else {
      reject('durationSeconds', `must be a whole number between 0 and ${MAX_DURATION_SECONDS}`, n);
    }
  } else if (result.startedAt && result.endedAt) {
    const seconds = Math.round((Date.parse(result.endedAt) - Date.parse(result.startedAt)) / 1000);
    if (seconds >= 0 && seconds <= MAX_DURATION_SECONDS) result.durationSeconds = seconds;
  }
  if (raw.agentErrors !== undefined) {
    if (Array.isArray(raw.agentErrors)) {
      const known = new Set<string>(AGENT_ERROR_COMPONENTS);
      result.agentErrors = [...new Set(raw.agentErrors.filter((c): c is string => typeof c === 'string' && known.has(c)))];
    } else {
      reject('agentErrors', 'must be a list', raw.agentErrors);
    }
  }

  // --- AI-extracted fields: only for a completed conversation ----------
  if (raw.outcome !== 'CONVERSATION_COMPLETED') {
    for (const field of AI_FIELDS) {
      if (present(raw[field])) reject(field, `not accepted when the call outcome is ${raw.outcome}`, raw[field]);
    }
    return { result, rejected };
  }

  if (present(raw.qualification)) {
    const q = typeof raw.qualification === 'string' ? raw.qualification.trim().toUpperCase() : '';
    if ((AI_QUALIFICATION_VALUES as readonly string[]).includes(q)) result.qualification = q as AiQualification;
    else reject('qualification', `must be one of ${AI_QUALIFICATION_VALUES.join(', ')}`, raw.qualification);
  }

  if (present(raw.summary)) {
    if (typeof raw.summary === 'string') {
      const text = raw.summary.trim();
      result.summary = text.length > MAX_SUMMARY_LENGTH ? `${text.slice(0, MAX_SUMMARY_LENGTH)}…` : text;
    } else {
      reject('summary', 'must be text', raw.summary);
    }
  }

  if (present(raw.quantity)) {
    const q = raw.quantity;
    const n = typeof q === 'number' ? q : typeof q === 'string' && /^\s*\d+\s*$/.test(q) ? Number(q) : NaN;
    if (Number.isInteger(n) && n >= 1 && n <= MAX_QUANTITY) result.quantity = n;
    else reject('quantity', `must be a whole number between 1 and ${MAX_QUANTITY}`, q);
  }

  for (const field of ['application', 'timeline', 'city'] as const) {
    if (!present(raw[field])) continue;
    const t = shortText(raw[field]);
    if (t.ok) result[field] = t.value;
    else reject(field, t.reason, raw[field]);
  }

  if (present(raw.state)) {
    const state = typeof raw.state === 'string' ? matchIndiaState(raw.state) : undefined;
    if (state) result.state = state;
    else reject('state', 'not a recognised Indian state or union territory', raw.state);
  }

  for (const field of ['siteVisitRequested', 'callbackRequested'] as const) {
    if (raw[field] === undefined || raw[field] === null) continue;
    if (typeof raw[field] === 'boolean') result[field] = raw[field] as boolean;
    else reject(field, 'must be true or false', raw[field]);
  }

  if (present(raw.callbackAt)) {
    const d = isoDate(raw.callbackAt, { defaultOffset: CALLBACK_DEFAULT_OFFSET, requireTime: true });
    if (!d.ok) {
      reject('callbackAt', d.reason, raw.callbackAt);
    } else if (Date.parse(d.value) < now.getTime() - CALLBACK_PAST_GRACE_MS) {
      reject('callbackAt', 'is in the past', raw.callbackAt);
    } else if (Date.parse(d.value) > now.getTime() + CALLBACK_MAX_AHEAD_MS) {
      reject('callbackAt', 'is more than a year ahead', raw.callbackAt);
    } else {
      result.callbackAt = d.value;
    }
  }

  return { result, rejected };
}

// The Lead's existing AiLeadStatus for this result. A technical failure is
// FAILED — never ANSWERED, QUALIFIED or a qualification. A conversation
// whose qualification could not be produced is ANSWERED with no
// qualification (not a guessed COLD).
export function leadAiStatusFor(result: SanitizedVoiceAgentResult): AiLeadStatus {
  if (result.outcome === 'AGENT_ERROR') return 'FAILED';
  if (result.outcome === 'NO_CONVERSATION') return 'ANSWERED';
  if (result.qualification === 'NOT_INTERESTED') return 'NOT_INTERESTED';
  if (result.qualification) return 'QUALIFIED';
  return 'ANSWERED';
}
