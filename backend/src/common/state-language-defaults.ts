import { PreferredLanguage } from '@prisma/client';
import { IndiaState } from './india-states';

// Additive: D.O.T. AI Lead Assistant Phase 1 — single source of truth for
// "what language should D.O.T. default to for a lead in this state". This
// is a DEFAULT ONLY: LeadsService applies it exclusively when a lead has no
// explicit language preference on file yet (languageSource is AUTO/
// STATE_DEFAULT/unset), and a customer's own stated preference — however
// it was captured (CUSTOMER/MANUAL/AI_DETECTED source) — always wins and is
// never overwritten by this map. Do not hardcode this mapping into
// individual React components; the frontend mirror lives at
// frontend/src/lib/stateLanguageDefaults.ts (same india-states.ts ↔
// indiaStates.ts mirroring convention already used elsewhere in this repo).
//
// Only states with a well-established single majority language are listed.
// Every other state (and any lead with no state at all) intentionally falls
// back to AUTO via getDefaultLanguageForState()'s return value below —
// guessing wrong for a linguistically mixed state (e.g. most of North India)
// would be worse than not guessing.
const STATE_LANGUAGE_DEFAULTS: Partial<Record<IndiaState, PreferredLanguage>> = {
  Telangana: PreferredLanguage.TELUGU,
  'Andhra Pradesh': PreferredLanguage.TELUGU,
  Karnataka: PreferredLanguage.KANNADA,
  'Tamil Nadu': PreferredLanguage.TAMIL,
  Kerala: PreferredLanguage.MALAYALAM,
  Maharashtra: PreferredLanguage.MARATHI,
  Gujarat: PreferredLanguage.GUJARATI,
  'West Bengal': PreferredLanguage.BENGALI,
};

// Returns the state's default language, or AUTO if the state is unset or
// has no reliable single-language default configured above.
export function getDefaultLanguageForState(state: string | null | undefined): PreferredLanguage {
  if (!state) return PreferredLanguage.AUTO;
  return STATE_LANGUAGE_DEFAULTS[state as IndiaState] ?? PreferredLanguage.AUTO;
}
