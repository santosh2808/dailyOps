import type { PreferredLanguage } from "@/types";
import type { IndiaState } from "./indiaStates";

// D.O.T. AI Lead Assistant Phase 1 — mirrors
// backend/src/common/state-language-defaults.ts exactly. Single reusable
// source of truth for "what language should D.O.T. default to for a lead in
// this state" — components should import getDefaultLanguageForState() from
// here rather than hardcoding this mapping themselves. DEFAULT ONLY: the
// backend (LeadsService) is what actually applies it, and only when a lead
// has no explicit language preference yet — a customer's own stated
// preference always wins and is never overwritten by this map.
const STATE_LANGUAGE_DEFAULTS: Partial<Record<IndiaState, PreferredLanguage>> = {
  Telangana: "TELUGU",
  "Andhra Pradesh": "TELUGU",
  Karnataka: "KANNADA",
  "Tamil Nadu": "TAMIL",
  Kerala: "MALAYALAM",
  Maharashtra: "MARATHI",
  Gujarat: "GUJARATI",
  "West Bengal": "BENGALI",
};

export function getDefaultLanguageForState(state: string | null | undefined): PreferredLanguage {
  if (!state) return "AUTO";
  return STATE_LANGUAGE_DEFAULTS[state as IndiaState] ?? "AUTO";
}
