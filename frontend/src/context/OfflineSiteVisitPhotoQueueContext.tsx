import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { uploadSiteVisitPhotos } from "@/api/leads";
import { toast } from "@/lib/toast";
import {
  enqueuePhoto as dbEnqueuePhoto,
  getAllQueuedPhotos,
  removeQueuedPhoto,
  updateQueuedPhotoError,
  type QueuedSiteVisitPhoto,
} from "@/lib/offlineSiteVisitPhotoQueue";
import type { LeadSiteVisitPhoto } from "@/types";

// Anti-fraud Site Visit photos — see offlineSiteVisitPhotoQueue.ts's own
// comment for the full "why" (user's "what if no signal?" question).
// Mounted once at the app root (see App.tsx) rather than inside
// SiteVisitOutcomeDialog, so a photo captured while offline keeps retrying
// in the background even if the rep closes the dialog, navigates
// elsewhere, or the connection only comes back after they've left the Lead
// entirely — the whole point is that nothing captured is ever silently
// lost, regardless of what the rep does with the app afterwards.
//
// Known limitation, deliberately not solved here: the eventual upload is
// attributed (uploadedBy) to whoever is logged in at DRAIN time, not
// capture time, same as every other actorName in this app (read from the
// request's JWT, not stored client-side). On a phone shared between reps
// this could misattribute a queued photo if the user changes before it
// drains — acceptable for this app's realistic one-rep-per-phone usage,
// but worth knowing.
//
// Also not real OS-level background sync (the Workbox Background Sync API
// isn't supported on iOS Safari, a large share of phones) — this only
// drains while the PWA tab/window is open. That's why the retry triggers
// below include both event-driven (online, mount) and a lightweight
// interval fallback, rather than relying solely on the 'online' event.

interface EnqueuePhotoInput {
  leadId: string;
  file: File;
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
}

interface OfflineSiteVisitPhotoQueueContextValue {
  pendingForLead: (leadId: string) => QueuedSiteVisitPhoto[];
  enqueuePhoto: (input: EnqueuePhotoInput) => Promise<void>;
  // Dialogs register here while open to learn the moment a queued photo for
  // "their" lead finally lands on the server, so they can merge it into
  // their own visible gallery the same way an immediate upload would.
  subscribe: (leadId: string, onUploaded: (photo: LeadSiteVisitPhoto) => void) => () => void;
}

const OfflineSiteVisitPhotoQueueContext = createContext<OfflineSiteVisitPhotoQueueContextValue | undefined>(
  undefined,
);

// Axios only sets `err.response` when the server actually answered (even
// with an error status like 400/413). No `response` at all means the
// request never reached the server — offline, DNS failure, timeout — which
// is exactly the "no signal" case this queue exists for, and is safe to
// retry indefinitely. A response that did arrive (e.g. an unexpected 400)
// means retrying the identical request will just fail the same way again,
// so those are left queued (never silently dropped — this is a rep's real
// site evidence) but not retried in a tight loop.
function isRetryableNetworkError(err: unknown): boolean {
  return !(err as { response?: unknown })?.response;
}

const RETRY_INTERVAL_MS = 20_000;

export function OfflineSiteVisitPhotoQueueProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<QueuedSiteVisitPhoto[]>([]);
  const draining = useRef(false);
  const listeners = useRef(new Map<string, Set<(photo: LeadSiteVisitPhoto) => void>>());

  const refresh = useCallback(async () => {
    setQueue(await getAllQueuedPhotos());
  }, []);

  const drain = useCallback(async () => {
    if (draining.current || !navigator.onLine) return;
    draining.current = true;
    try {
      const current = await getAllQueuedPhotos();
      let uploadedCount = 0;
      for (const record of current) {
        try {
          const [uploaded] = await uploadSiteVisitPhotos(record.leadId, [record.file], {
            latitude: record.latitude,
            longitude: record.longitude,
            accuracyMeters: record.accuracyMeters,
          });
          await removeQueuedPhoto(record.id);
          uploadedCount += 1;
          listeners.current.get(record.leadId)?.forEach((cb) => cb(uploaded));
        } catch (err) {
          if (isRetryableNetworkError(err)) {
            // Still offline (or the server is unreachable) — leave it
            // queued, try again on the next drain trigger.
            continue;
          }
          // The server actually responded and rejected it — record why,
          // for whoever eventually looks at Administration, but keep the
          // photo queued rather than deleting it silently.
          const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
          await updateQueuedPhotoError(
            record.id,
            typeof message === "string" ? message : "Upload was rejected by the server.",
          );
        }
      }
      await refresh();
      if (uploadedCount > 0) {
        toast.success(
          uploadedCount === 1
            ? "A queued site photo just uploaded."
            : `${uploadedCount} queued site photos just uploaded.`,
        );
      }
    } finally {
      draining.current = false;
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
    drain();
    window.addEventListener("online", drain);
    return () => window.removeEventListener("online", drain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lightweight backstop for platforms where the 'online' event doesn't
  // fire reliably — only runs at all while something is actually queued,
  // so it's a no-op (no network calls, no battery cost) the rest of the
  // time.
  useEffect(() => {
    if (queue.length === 0) return;
    const interval = setInterval(drain, RETRY_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [queue.length, drain]);

  const enqueuePhoto = useCallback(
    async (input: EnqueuePhotoInput) => {
      const record: QueuedSiteVisitPhoto = {
        id: crypto.randomUUID(),
        leadId: input.leadId,
        file: input.file,
        latitude: input.latitude,
        longitude: input.longitude,
        accuracyMeters: input.accuracyMeters,
        capturedAt: new Date().toISOString(),
      };
      // Written to durable storage BEFORE attempting the upload — even on
      // the happy, fully-online path — so a crash or tab close mid-request
      // can't lose a photo the rep already took. drain() picks it straight
      // back up afterward.
      await dbEnqueuePhoto(record);
      await refresh();
      await drain();
    },
    [refresh, drain],
  );

  const pendingForLead = useCallback((leadId: string) => queue.filter((q) => q.leadId === leadId), [queue]);

  const subscribe = useCallback((leadId: string, onUploaded: (photo: LeadSiteVisitPhoto) => void) => {
    if (!listeners.current.has(leadId)) listeners.current.set(leadId, new Set());
    listeners.current.get(leadId)!.add(onUploaded);
    return () => {
      listeners.current.get(leadId)?.delete(onUploaded);
    };
  }, []);

  return (
    <OfflineSiteVisitPhotoQueueContext.Provider value={{ pendingForLead, enqueuePhoto, subscribe }}>
      {children}
    </OfflineSiteVisitPhotoQueueContext.Provider>
  );
}

export function useOfflineSiteVisitPhotoQueue() {
  const ctx = useContext(OfflineSiteVisitPhotoQueueContext);
  if (!ctx) {
    throw new Error("useOfflineSiteVisitPhotoQueue must be used within an OfflineSiteVisitPhotoQueueProvider");
  }
  return ctx;
}
