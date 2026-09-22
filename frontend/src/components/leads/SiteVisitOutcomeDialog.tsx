import { useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
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
import { uploadSiteVisitPhotos } from "@/api/leads";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/errors";
import { todayDateInputValue, isPastDateInputValue } from "@/lib/date";
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
  // submitting/error state above, since photos upload immediately on
  // selection rather than waiting for "Log Outcome".
  const [photos, setPhotos] = useState<LeadSiteVisitPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setOutcome("READY_TO_QUOTE");
      setNotes("");
      setNextVisitDate("");
      setError("");
      setPhotos(lead?.siteVisitPhotos ?? []);
    }
  }, [open, lead]);

  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || !lead) return;
    const files = Array.from(fileList);
    setUploading(true);
    try {
      const uploaded = await uploadSiteVisitPhotos(lead.id, files);
      const next = [...photos, ...uploaded];
      setPhotos(next);
      onPhotosChanged?.(next);
      toast.success(
        uploaded.length === 1 ? "Photo uploaded." : `${uploaded.length} photos uploaded.`,
      );
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not upload these photos. Please try again."));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handlePhotoDeleted(photoId: string) {
    const next = photos.filter((p) => p.id !== photoId);
    setPhotos(next);
    onPhotosChanged?.(next);
  }

  async function handleConfirm() {
    setError("");
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
    } catch {
      setError("Could not log this site visit outcome. Please try again.");
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Spinner className="mr-2 h-4 w-4" /> : <ImagePlus className="mr-2 h-4 w-4" />}
              {uploading ? "Uploading..." : "Add Photos"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              className="hidden"
              onChange={(e) => handleFilesSelected(e.target.files)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Photos help the factory build to what's actually on site. No minimum required.
          </p>
          <SiteVisitPhotoGallery
            leadId={lead.id}
            photos={photos}
            editable
            onPhotoDeleted={handlePhotoDeleted}
            emptyHint="No site photos added yet."
          />
        </div>

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
