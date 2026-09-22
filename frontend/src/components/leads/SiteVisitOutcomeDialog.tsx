import { useEffect, useState } from "react";
import { Camera, Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import SiteVisitPhotoGallery from "./SiteVisitPhotoGallery";
import SiteVisitCameraCapture from "./SiteVisitCameraCapture";
import { useOfflineSiteVisitPhotoQueue } from "@/context/OfflineSiteVisitPhotoQueueContext";
import { todayDateInputValue, isPastDateInputValue } from "@/lib/date";
import { getErrorMessage } from "@/lib/errors";
import type { Lead, LeadSiteVisitPhoto } from "@/types";

export type SiteVisitOutcome = "READY_TO_QUOTE" | "NEEDS_ANOTHER_VISIT" | "NOT_VIABLE";

const OUTCOME_OPTIONS: { value: SiteVisitOutcome; label: string; hint: string }[] = [
  {
    value: "READY_TO_QUOTE",
    label: "Ready to Quote",
    hint: "Moves this lead to Qualified. Requires at least one product linked.",
  },
  {
    value: "NEEDS_ANOTHER_VISIT",
    label: "Needs Another Visit",
    hint: "Stays at Site Visit — set a new visit date.",
  },
  {
    value: "NOT_VIABLE",
    label: "Not Viable",
    hint: "Closes this lead as Lost.",
  },
];

interface SiteVisitOutcomeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
  onConfirm: (outcome: SiteVisitOutcome, notes: string, nextVisitDate?: string) => Promise<void>;
  // Fires immediately after a photo upload/delete succeeds, independent of
  // Log Outcome — lets LeadDetails.tsx keep its own `lead.siteVisitPhotos`
  // (and the gallery card built from it) in sync even if the user closes
  // this dialog with Cancel instead of submitting an outcome.
  onPhotosChanged?: (photos: LeadSiteVisitPhoto[]) => void;
}

// UX fix, same shape as ContactOutcomeDialog: "Complete Site Visit" used to
// just open the generic Change Status dropdown — a bare status picker with
// no way to record what was actually found on site, and no route back to
// "needs a second visit" other than manually re-picking Site Visit from the
// same dropdown. This captures the real outcome (what happened, and what's
// next) and LeadDetails.handleSiteVisitOutcomeConfirm() decides the status
// change from it, mirroring handleContactOutcomeConfirm() exactly.
export default function SiteVisitOutcomeDialog({
  open,
  onOpenChange,
  lead,
  onConfirm,
  onPhotosChanged,
}: SiteVisitOutcomeDialogProps) {
  const [outcome, setOutcome] = useState<SiteVisitOutcome>("READY_TO_QUOTE");
  const [notes, setNotes] = useState("");
  const [nextVisitDate, setNextVisitDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Site visit photo evidence (see notifySiteVisitScheduled's sibling
  // feature) — deliberately independent of the outcome form's own
  // submitting/error state above, since photos capture/upload immediately
  // rather than waiting for "Log Outcome". Capture itself happens in
  // SiteVisitCameraCapture (in-app camera, not a file picker — see its own
  // comment for why); every captured shot is handed to the offline queue
  // (see OfflineSiteVisitPhotoQueueContext) rather than uploaded directly
  // here, so a photo taken with no signal is never lost — it just uploads
  // the moment connectivity returns, from wherever the app happens to be
  // open at that point, not necessarily this dialog.
  const [photos, setPhotos] = useState<LeadSiteVisitPhoto[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [pendingThumbnails, setPendingThumbnails] = useState<Record<string, string>>({});
  const { enqueuePhoto, pendingForLead, subscribe } = useOfflineSiteVisitPhotoQueue();
  const pendingPhotos = lead ? pendingForLead(lead.id) : [];

  useEffect(() => {
    if (open) {
      setOutcome("READY_TO_QUOTE");
      setNotes("");
      setNextVisitDate("");
      setError("");
      setPhotos(lead?.siteVisitPhotos ?? []);
    }
  }, [open, lead]);

  // Learns the moment a queued photo for this lead actually lands on the
  // server — including ones that were queued in a previous dialog session
  // and only just came back online — so the confirmed gallery below picks
  // it up without the rep needing to reopen anything.
  useEffect(() => {
    if (!lead) return;
    return subscribe(lead.id, (uploadedPhoto) => {
      setPhotos((prev) => {
        const next = [...prev, uploadedPhoto];
        onPhotosChanged?.(next);
        return next;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id]);

  // Local (not server) thumbnails for photos still sitting in the offline
  // queue — we already have the raw File in memory, no need to round-trip
  // through the authenticated streaming endpoint like SiteVisitPhotoGallery
  // does for confirmed photos.
  useEffect(() => {
    setPendingThumbnails((prev) => {
      const next: Record<string, string> = {};
      pendingPhotos.forEach((p) => {
        next[p.id] = prev[p.id] ?? URL.createObjectURL(p.file);
      });
      Object.entries(prev).forEach(([id, url]) => {
        if (!next[id]) URL.revokeObjectURL(url);
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPhotos.map((p) => p.id).join(",")]);

  useEffect(() => {
    return () => {
      Object.values(pendingThumbnails).forEach((url) => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePhotoDeleted(photoId: string) {
    const next = photos.filter((p) => p.id !== photoId);
    setPhotos(next);
    onPhotosChanged?.(next);
  }

  async function handleConfirm() {
    setError("");
    // Anti-fraud (user's own request: "i think site visit photos mandatory
    // if they go for site visit") — required for every outcome, not just
    // the ones that move the lead out of Site Visit status, since logging
    // ANY outcome here is itself the claim "I visited." A photo still
    // uploading in the offline queue (no signal yet) counts — the rep did
    // take it, see OfflineSiteVisitPhotoQueueContext's own comment on why
    // that shouldn't block them. The backend enforces this independently
    // too (see updateStatus()) for the outcomes that do change status, so
    // this can't be skipped via the generic Change Status dropdown either.
    if (photos.length === 0 && pendingPhotos.length === 0) {
      setError("Add at least one site photo before logging this outcome.");
      return;
    }
    // Same pre-check ChangeStatusDialog already does for a direct Qualified
    // change — surfaced immediately here too, rather than only after a
    // round trip to the backend, which enforces this same rule.
    if (outcome === "READY_TO_QUOTE" && (!lead?.products || lead.products.length === 0)) {
      setError("This lead has no products linked yet. Add products to the lead before marking it Qualified.");
      return;
    }
    if (outcome === "NEEDS_ANOTHER_VISIT") {
      if (!nextVisitDate) {
        setError("Pick a date for the next site visit.");
        return;
      }
      if (isPastDateInputValue(nextVisitDate)) {
        setError("Next visit date cannot be before today");
        return;
      }
    }
    setSubmitting(true);
    try {
      await onConfirm(outcome, notes.trim(), nextVisitDate || undefined);
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err, "Could not log this site visit outcome. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  if (!lead) return null;

  const selected = OUTCOME_OPTIONS.find((o) => o.value === outcome);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Log Site Visit Outcome</DialogTitle>
          <DialogDescription>
            What happened at the site visit for{" "}
            <span className="font-medium text-slate-900">{lead.companyName}</span> —{" "}
            {lead.leadNumber}?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="site-visit-outcome">Outcome</Label>
          <Select
            id="site-visit-outcome"
            value={outcome}
            onChange={(e) => {
              // Same fix as ContactOutcomeDialog: an outcome-specific error
              // (missing products for Ready to Quote, missing date for
              // Needs Another Visit) shouldn't linger once the user picks a
              // different outcome it no longer applies to.
              setOutcome(e.target.value as SiteVisitOutcome);
              setError("");
            }}
          >
            {OUTCOME_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          {selected && <p className="text-xs text-muted-foreground">{selected.hint}</p>}
        </div>

        <div className="mt-4 space-y-2">
          <Label htmlFor="site-visit-notes">Notes (optional)</Label>
          <Textarea
            id="site-visit-notes"
            placeholder="What did you find on site? What does the customer need?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <Label>Site Photos (optional)</Label>
            <Button type="button" variant="outline" size="sm" onClick={() => setCameraOpen(true)}>
              <Camera className="mr-2 h-4 w-4" />
              Take Photo
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Photos help the factory build to what's actually on site. No minimum required. Your
            device will ask for location access — this is required to confirm the photo was
            taken on site. Photos taken with no signal upload automatically once you're back in
            range.
          </p>
          <SiteVisitPhotoGallery
            leadId={lead.id}
            photos={photos}
            editable
            onPhotoDeleted={handlePhotoDeleted}
            emptyHint="No site photos added yet."
          />
          {pendingPhotos.length > 0 && (
            <div className="space-y-1">
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {pendingPhotos.length === 1
                  ? "1 photo waiting to upload"
                  : `${pendingPhotos.length} photos waiting to upload`}
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {pendingPhotos.map((p) => (
                  <div
                    key={p.id}
                    className="relative aspect-square overflow-hidden rounded-md border border-slate-200 bg-slate-50 opacity-60"
                  >
                    {pendingThumbnails[p.id] && (
                      <img
                        src={pendingThumbnails[p.id]}
                        alt="Queued site photo"
                        className="h-full w-full object-cover"
                      />
                    )}
                    <div
                      className="absolute inset-0 flex items-center justify-center bg-black/30"
                      title={p.lastError ? `Waiting to retry: ${p.lastError}` : "Waiting for connection"}
                    >
                      <Clock className="h-4 w-4 text-white" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <SiteVisitCameraCapture
          open={cameraOpen}
          onClose={() => setCameraOpen(false)}
          onCapture={({ file, location }) => {
            if (!lead) return;
            enqueuePhoto({
              leadId: lead.id,
              file,
              latitude: location.latitude,
              longitude: location.longitude,
              accuracyMeters: location.accuracyMeters,
            });
          }}
        />

        {outcome === "NEEDS_ANOTHER_VISIT" && (
          <div className="mt-4 space-y-2">
            <Label htmlFor="site-visit-next-date">Next Visit Date *</Label>
            <Input
              id="site-visit-next-date"
              type="date"
              min={todayDateInputValue()}
              value={nextVisitDate}
              onChange={(e) => setNextVisitDate(e.target.value)}
            />
          </div>
        )}

        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={submitting}>
            {submitting && <Spinner className="mr-2 h-4 w-4" />}
            {submitting ? "Saving..." : "Log Outcome"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
