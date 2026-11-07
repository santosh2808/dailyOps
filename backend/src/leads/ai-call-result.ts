import { AiLeadStatus, AiQualification, LanguageSource, PreferredLanguage, Prisma } from '@prisma/client';

// D.O.T. call-result write-back (Phase 0) — the ONE place a D.O.T. call
// result is written onto a Lead. Shared by LeadsService.addAiCallLog() (the
// existing manual/API endpoint) and the voice-agent's service-authenticated
// result submission (telephony/voice-agent-call-result.service.ts), so both
// follow the same approved rule:
//
//   AI may fill EMPTY lead fields, but never overwrites a value a person
//   already entered. A conflicting AI value is kept on the call log
//   (LeadAiCallLog.fieldSuggestions) for a salesperson to review.
//
// Never touches Lead.status, Lead.priority, assignment, or any other
// user-managed field. Only the AI-owned `ai*` roll-up fields are always
// updated, as they were before.

export interface AiCallResultInput {
  status: AiLeadStatus;
  externalCallId?: string;
  startedAt?: Date;
  endedAt?: Date;
  durationSeconds?: number;
  language?: PreferredLanguage;
  qualification?: AiQualification;
  summary?: string;
  quantity?: number;
  application?: string;
  timeline?: string;
  city?: string;
  state?: string;
  siteVisitRequested?: boolean;
  callbackRequested?: boolean;
  callbackAt?: Date | null;
  transcriptRef?: string;
  recordingRef?: string;
}

// The user-managed Lead columns the AI is allowed to fill when empty.
export const AI_FILLABLE_LEAD_FIELDS = ['city', 'state', 'quantity', 'application', 'timeline'] as const;
export type AiFillableLeadField = (typeof AI_FILLABLE_LEAD_FIELDS)[number];

export interface AiFieldSuggestion {
  field: AiFillableLeadField;
  aiValue: string | number;
  leadValue: string | number;
}

type FillableValues = { [K in AiFillableLeadField]?: string | number | null };

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

// "Same value" for the purpose of deciding whether there is a conflict:
// case- and whitespace-insensitive for text, exact for numbers. Equal
// values are neither written nor suggested.
function sameValue(a: string | number, b: string | number): boolean {
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  return norm(a) === norm(b);
}

// Pure: decides which AI values fill empty lead fields and which become
// suggestions. Exported for unit tests.
export function planLeadFieldMerge(
  current: FillableValues,
  incoming: FillableValues,
): { fill: FillableValues; suggestions: AiFieldSuggestion[] } {
  const fill: FillableValues = {};
  const suggestions: AiFieldSuggestion[] = [];
  for (const field of AI_FILLABLE_LEAD_FIELDS) {
    const aiValue = incoming[field];
    if (isEmpty(aiValue)) continue;
    const leadValue = current[field];
    if (isEmpty(leadValue)) {
      fill[field] = aiValue;
    } else if (!sameValue(leadValue as string | number, aiValue as string | number)) {
      suggestions.push({ field, aiValue: aiValue as string | number, leadValue: leadValue as string | number });
    }
  }
  return { fill, suggestions };
}

// Timeline text. Only fields actually written to the lead are described as
// applied ("filled empty …"); values that conflicted are named as
// suggestions NOT applied — never presented as the lead's value.
function historyDescription(
  input: AiCallResultInput,
  filled: AiFillableLeadField[],
  suggestions: AiFieldSuggestion[],
): string {
  let text = `D.O.T. call logged — status ${input.status}`;
  if (input.qualification) text += `, qualification ${input.qualification}`;
  if (filled.length > 0) {
    text += `; filled empty ${filled.map((f) => (f === 'quantity' ? `quantity (${input.quantity})` : f)).join(', ')}`;
  }
  if (suggestions.length > 0) {
    text += `; ${suggestions.length} AI value(s) differed from the lead and were NOT applied — kept as suggestions (${suggestions
      .map((s) => s.field)
      .join(', ')})`;
  }
  return text;
}

// Writes one call result onto a Lead inside the caller's transaction:
// LeadAiCallLog row + AI roll-up + fill-empty-only requirement fields +
// one Timeline (LeadHistory) entry. Locks the Lead row first, so the
// "is this field empty?" check and the fill happen against the same row
// version: a salesperson's save that commits in between can't be
// overwritten by a fill decided on the older, empty value.
export async function writeAiCallResultToLead(
  tx: Prisma.TransactionClient,
  leadId: string,
  input: AiCallResultInput,
  performedBy?: string,
): Promise<{ suggestions: AiFieldSuggestion[]; filled: AiFillableLeadField[] }> {
  await tx.$queryRaw`SELECT id FROM "Lead" WHERE id = ${leadId} FOR UPDATE`;
  const current = await tx.lead.findUniqueOrThrow({
    where: { id: leadId },
    select: { city: true, state: true, quantity: true, application: true, timeline: true },
  });

  const { fill, suggestions } = planLeadFieldMerge(current, {
    city: input.city,
    state: input.state,
    quantity: input.quantity,
    application: input.application,
    timeline: input.timeline,
  });
  const filled = Object.keys(fill) as AiFillableLeadField[];

  await tx.leadAiCallLog.create({
    data: {
      leadId,
      externalCallId: input.externalCallId,
      status: input.status,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      durationSeconds: input.durationSeconds,
      language: input.language,
      qualification: input.qualification,
      summary: input.summary,
      // Per-call snapshot of what the AI reported on THIS call, regardless
      // of whether it was applied to the Lead.
      quantity: input.quantity,
      application: input.application,
      timeline: input.timeline,
      transcriptRef: input.transcriptRef,
      recordingRef: input.recordingRef,
      performedBy,
      fieldSuggestions: suggestions.length > 0 ? (suggestions as unknown as Prisma.InputJsonValue) : undefined,
    },
  });

  await tx.lead.update({
    where: { id: leadId },
    data: {
      aiStatus: input.status,
      aiCallAttempts: { increment: 1 },
      lastAiCallAt: input.startedAt ?? new Date(),
      ...(input.qualification !== undefined ? { aiQualification: input.qualification } : {}),
      ...(input.summary !== undefined ? { aiSummary: input.summary } : {}),
      ...(fill as Prisma.LeadUpdateInput),
      ...(input.siteVisitRequested !== undefined ? { aiSiteVisitRequested: input.siteVisitRequested } : {}),
      ...(input.callbackRequested !== undefined ? { aiCallbackRequested: input.callbackRequested } : {}),
      ...(input.callbackAt !== undefined ? { aiCallbackAt: input.callbackAt } : {}),
      // A language the call was actually conducted in outranks the
      // state-based default (unchanged behaviour).
      ...(input.language !== undefined
        ? { preferredLanguage: input.language, languageSource: LanguageSource.AI_DETECTED }
        : {}),
    },
  });

  await tx.leadHistory.create({
    data: {
      leadId,
      action: 'AI_CALL_LOGGED',
      description: historyDescription(input, filled, suggestions),
      performedBy,
    },
  });

  return { suggestions, filled };
}
