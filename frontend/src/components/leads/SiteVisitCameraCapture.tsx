import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { captureCurrentLocation, type CapturedLocation } from "@/lib/geolocation";
import { toast } from "@/lib/toast";

export interface CapturedShot {
  file: File;
  location: CapturedLocation;
}

interface SiteVisitCameraCaptureProps {
  open: boolean;
  onClose: () => void;
  onCapture: (shot: CapturedShot) => void;
}

// Anti-fraud (user's own follow-up question: "what if they visited site
// today took pics. and uploaded pics tomorrow in other location?") — this
// replaces a plain <input type="file" capture="environment"> with a real
// in-app camera. That file-input approach opened the phone's native camera
// app most of the time, but some browsers still let the user back out and
// pick an existing photo from their gallery instead — meaning a photo
// taken (or downloaded) at any earlier time, anywhere, could be "uploaded"
// later with today's GPS fix attached to it, making it look freshly taken
// when it wasn't. Rendering our own live camera view here removes that gap
// entirely: the photo file doesn't exist until the shutter button below is
// pressed, inside this component, with location captured moments earlier
// in the same session — there is no gallery step to substitute a different
// file into.
//
// Location is fetched ONCE, before the shutter is even enabled, and reused
// for every shot taken in this same open session — re-requesting a fresh
// GPS fix before every individual photo would make taking several photos
// at once painfully slow, and the whole visit happens in the same spot
// over a few minutes anyway. See captureCurrentLocation's own comment for
// why it's never a cached/stale fix.
export default function SiteVisitCameraCapture({ open, onClose, onCapture }: SiteVisitCameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<"locating" | "starting" | "ready" | "error">("locating");
  const [errorMessage, setErrorMessage] = useState("");
  const [location, setLocation] = useState<CapturedLocation | null>(null);
  const [shotCount, setShotCount] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPhase("locating");
    setErrorMessage("");
    setShotCount(0);
    setLocation(null);

    (async () => {
      let loc: CapturedLocation;
      try {
        loc = await captureCurrentLocation();
      } catch (err) {
        if (!cancelled) {
          setPhase("error");
          setErrorMessage(err instanceof Error ? err.message : "Could not get your location.");
        }
        return;
      }
      if (cancelled) return;
      setLocation(loc);
      setPhase("starting");

      if (!navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) {
          setPhase("error");
          setErrorMessage("This browser doesn't support camera access. Try a different browser or device.");
        }
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setPhase("ready");
      } catch {
        if (!cancelled) {
          setPhase("error");
          setErrorMessage("Could not access the camera. Check that camera access is allowed for this app.");
        }
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open]);

  function handleShutter() {
    const video = videoRef.current;
    if (!video || !location || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          toast.error("Could not capture this photo. Please try again.");
          return;
        }
        const file = new File([blob], `site-visit-${Date.now()}.jpg`, { type: "image/jpeg" });
        onCapture({ file, location });
        setShotCount((c) => c + 1);
      },
      "image/jpeg",
      0.85,
    );
  }

  function handleClose() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black">
      <div className="flex items-center justify-between p-4 text-white">
        <p className="text-sm">
          {phase === "ready" &&
            (shotCount > 0
              ? `${shotCount} photo${shotCount === 1 ? "" : "s"} captured`
              : "Point at what you want to show the factory")}
        </p>
        <button
          type="button"
          onClick={handleClose}
          className="rounded-full bg-white/10 p-2 text-white"
          title="Close camera"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {(phase === "locating" || phase === "starting") && (
          <div className="flex flex-col items-center gap-3 text-white">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">{phase === "locating" ? "Getting your location..." : "Starting camera..."}</p>
          </div>
        )}
        {phase === "error" && (
          <div className="mx-6 max-w-sm text-center text-white">
            <p className="text-sm">{errorMessage}</p>
            <Button type="button" variant="outline" className="mt-4" onClick={handleClose}>
              Close
            </Button>
          </div>
        )}
        {/* Always mounted (once we reach "starting"/"ready") rather than
            conditionally rendered, so srcObject assignment above doesn't
            race a remount — just hidden until the stream is actually
            playing. */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={cn("h-full w-full object-contain", phase !== "ready" && "hidden")}
        />
      </div>

      {phase === "ready" && (
        <div className="flex items-center justify-center gap-6 p-6">
          <button
            type="button"
            onClick={handleShutter}
            className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/20 active:bg-white/40"
            title="Capture photo"
          >
            <Camera className="h-6 w-6 text-white" />
          </button>
          {shotCount > 0 && (
            <Button type="button" onClick={handleClose}>
              Done
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
