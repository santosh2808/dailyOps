import type { BadgeProps } from "@/components/ui/badge";
import type { AiLeadStatus, AiQualification, LanguageSource, PreferredLanguage } from "@/types";

// D.O.T. AI Lead Assistant Phase 1 — central place for AI enum ->
// label/color mappings, same split as leadOptions.ts's STATUS_OPTIONS
// (badge component + this options file, never a switch embedded in the
// component itself).

export const AI_STATUS_OPTIONS: { value: AiLeadStatus; label: string; badge: BadgeProps["variant"] }[] = [
  { value: "NOT_STARTED", label: "Not Started", badge: "muted" },
  { value: "CALL_SCHEDULED", label: "Call Scheduled", badge: "info" },
  { value: "CALLING", label: "Calling", badge: "info" },
  { value: "ANSWERED", label: "Answered", badge: "info" },
  { value: "NO_ANSWER", label: "No Answer", badge: "muted" },
  { value: "CALLBACK_REQUESTED", label: "Callback Requested", badge: "warning" },
  { value: "QUALIFIED", label: "Qualified", badge: "success" },
  { value: "NOT_QUALIFIED", label: "Not Qualified", badge: "muted" },
  { value: "NOT_INTERESTED", label: "Not Interested", badge: "destructive" },
  { value: "FAILED", label: "Failed", badge: "destructive" },
];

export const AI_QUALIFICATION_OPTIONS: { value: AiQualification; label: string; badge: BadgeProps["variant"] }[] = [
  { value: "HOT", label: "Hot", badge: "destructive" },
  { value: "WARM", label: "Warm", badge: "warning" },
  { value: "COLD", label: "Cold", badge: "info" },
  { value: "NOT_INTERESTED", label: "Not Interested", badge: "muted" },
];

export const PREFERRED_LANGUAGE_OPTIONS: { value: PreferredLanguage; label: string }[] = [
  { value: "AUTO", label: "Auto" },
  { value: "ENGLISH", label: "English" },
  { value: "TELUGU", label: "Telugu" },
  { value: "HINDI", label: "Hindi" },
  { value: "KANNADA", label: "Kannada" },
  { value: "TAMIL", label: "Tamil" },
  { value: "MALAYALAM", label: "Malayalam" },
  { value: "MARATHI", label: "Marathi" },
  { value: "GUJARATI", label: "Gujarati" },
  { value: "BENGALI", label: "Bengali" },
];

export const LANGUAGE_SOURCE_LABELS: Record<LanguageSource, string> = {
  CUSTOMER: "Customer stated",
  AI_DETECTED: "Detected by D.O.T.",
  STATE_DEFAULT: "State default",
  MANUAL: "Set manually",
  AUTO: "Not set",
};

export function aiStatusLabel(status: AiLeadStatus) {
  return AI_STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
}

export function aiStatusBadgeVariant(status: AiLeadStatus): BadgeProps["variant"] {
  return AI_STATUS_OPTIONS.find((s) => s.value === status)?.badge ?? "default";
}

export function aiQualificationLabel(qualification: AiQualification) {
  return AI_QUALIFICATION_OPTIONS.find((q) => q.value === qualification)?.label ?? qualification;
}

export function aiQualificationBadgeVariant(qualification: AiQualification): BadgeProps["variant"] {
  return AI_QUALIFICATION_OPTIONS.find((q) => q.value === qualification)?.badge ?? "default";
}

export function preferredLanguageLabel(language: PreferredLanguage) {
  return PREFERRED_LANGUAGE_OPTIONS.find((l) => l.value === language)?.label ?? language;
}
