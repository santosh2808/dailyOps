import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { deleteSiteVisitPhoto, getSiteVisitPhotoBlobUrl } from "@/api/leads";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/errors";
import type { LeadSiteVisitPhoto } from "@/types";

interface SiteVisitPhotoGalleryProps {
  leadId: string;
  photos: LeadSiteVisitPhoto[];
  editable?: boolean;
  onPhotoDeleted?: (photoId: string) => void;
  emptyHint?: string;
}

// Shared by SiteVisitOutcomeDialog (editable, right after the visit) and the
// read-only galleries on Lead Details / JEO Details — the factory engineer's
// actual view of what's on site (see JobExecutionOrderDetails.tsx), which
// was the whole point of building this feature. Photos are served through
// an authenticated streaming route rather than a static URL, so every
// thumbnail is fetched as a blob (see getSiteVisitPhotoBlobUrl's own comment
// in api/leads.ts) rather than a plain <img src>.
export default function SiteVisitPhotoGallery({
  leadId,
  photos,
  editable = false,
  onPhotoDeleted,
  emptyHint = "No site visit photos yet.",
}: SiteVisitPhotoGalleryProps) {
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const photoIds = photos.map((p) => p.id).join(",");

  useEffect(() => {
    let cancelled = false;
    const toFetch = photos.filter((p) => !thumbnails[p.id]);
    toFetch.forEach(async (photo) => {
      try {
        const url = await getSiteVisitPhotoBlobUrl(leadId, photo.id);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        setThumbnails((prev) => (prev[photo.id] ? prev : { ...prev, [photo.id]: url }));
      } catch {
        // Best-effort — a failed thumbnail just leaves that tile spinning
        // forever rather than blocking the rest of the gallery.
      }
    });
    return () => {
      cancelled = true;
    };
    // Deliberately excluding `thumbnails` here — it's only read to skip
    // already-fetched ids, and including it would re-run this effect every
    // time it's updated by the fetch below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, photoIds]);

  // Revoke every object URL this gallery created once it unmounts (e.g.
  // dialog closes, or the user navigates off the page), so a lead with many
  // photos doesn't leak blob memory.
  useEffect(() => {
    return () => {
      Object.values(thumbnails).forEach((url) => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDelete(photoId: string) {
    setDeletingId(photoId);
    try {
      await deleteSiteVisitPhoto(leadId, photoId);
      const url = thumbnails[photoId];
      if (url) URL.revokeObjectURL(url);
      setThumbnails((prev) => {
        const next = { ...prev };
        delete next[photoId];
        return next;
      });
      onPhotoDeleted?.(photoId);
      toast.success("Photo removed.");
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not remove this photo. Please try again."));
    } finally {
      setDeletingId(null);
    }
  }

  if (photos.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyHint}</p>;
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {photos.map((photo) => {
        const url = thumbnails[photo.id];
        return (
          <div
            key={photo.id}
            className="group relative aspect-square overflow-hidden rounded-md border border-slate-200 bg-slate-50"
          >
            {url ? (
              <a href={url} target="_blank" rel="noreferrer" title={photo.originalName}>
                <img src={url} alt={photo.originalName} className="h-full w-full object-cover" />
              </a>
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {editable && (
              <button
                type="button"
                onClick={() => handleDelete(photo.id)}
                disabled={deletingId === photo.id}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-100"
                title="Remove photo"
              >
                {deletingId === photo.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
