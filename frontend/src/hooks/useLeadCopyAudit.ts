import { useEffect } from "react";
import { reportLeadAccessEvent } from "@/api/leads";

// Reports copy / cut / print actions on a Leads screen to the audit log (see
// LeadAccessService on the backend). It only sees actions made in this app's
// browser tab — a screenshot or a photo of the screen can't be detected.
// Throttled so one big copy doesn't produce a burst of events.
export function useLeadCopyAudit(page: string, leadId?: string) {
  useEffect(() => {
    let lastSent = 0;

    function send(type: "COPY" | "PRINT", chars?: number) {
      const now = Date.now();
      if (now - lastSent < 2000) return;
      lastSent = now;
      reportLeadAccessEvent({ type, leadId, chars, page }).catch(() => {
        // Best-effort: never interrupt the user's copy/print.
      });
    }

    function selectedLength(): number {
      const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA") && el.selectionStart != null) {
        return Math.max(0, (el.selectionEnd ?? 0) - el.selectionStart);
      }
      return window.getSelection()?.toString().length ?? 0;
    }

    function onCopy() {
      const chars = selectedLength();
      if (chars > 0) send("COPY", chars);
    }
    function onBeforePrint() {
      send("PRINT");
    }

    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    window.addEventListener("beforeprint", onBeforePrint);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      window.removeEventListener("beforeprint", onBeforePrint);
    };
  }, [page, leadId]);
}
