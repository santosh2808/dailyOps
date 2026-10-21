import { useRef, useState, type DragEvent } from "react";
import { ArrowDown, ArrowUp, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errors";
import { toContentImage, uploadContentImage } from "@/api/content";
import ImageField from "./ImageField";
import { ACCEPTED_IMAGE_TYPES, prepareImage } from "./imageResize";
import { LIMITS } from "./contentOptions";
import type { ContentImage } from "@/types";

interface GalleryFieldProps {
  websiteId: string;
  value: ContentImage[];
  onChange: (value: ContentImage[]) => void;
  errors: Record<string, string>;
  disabled?: boolean;
}

// Project photos
export default function GalleryField({ websiteId, value, onChange, errors, disabled }: GalleryFieldProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const room = LIMITS.gallery - value.length;

  async function handleFiles(list: FileList | null) {
    const files = Array.from(list ?? []).slice(0, room);
    if (fileRef.current) fileRef.current.value = "";
    if (files.length === 0) return;
    setUploadError("");
    let current = value;
    for (const [index, file] of files.entries()) {
      setProgress(files.length > 1 ? `Uploading ${index + 1} of ${files.length}...` : "Uploading...");
      try {
        const uploaded = await uploadContentImage(websiteId, await prepareImage(file));
        current = [...current, toContentImage(uploaded)];
        onChange(current);
      } catch (err) {
        setUploadError(
          `${file.name}: ${err instanceof Error && !("response" in err) ? err.message : getErrorMessage(err, "Upload failed.")}`,
        );
      }
    }
    setProgress("");
  }

  function move(index: number, by: -1 | 1) {
    const next = [...value];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    onChange(next);
  }

  function handleDrop(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    setDragOver(false);
    if (!disabled && !progress) handleFiles(e.dataTransfer.files);
  }

  return (
    <div className="space-y-3" data-error-key="gallery">
      <div className="flex items-center justify-between">
        <Label>Project photos</Label>
        <span className="text-xs text-muted-foreground">
          {value.length} / {LIMITS.gallery}
        </span>
      </div>
      {value.length === 0 && <p className="text-sm text-muted-foreground">No photos yet.</p>}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {value.map((image, index) => (
          <div key={image.key} className="space-y-1">
            <ImageField
              id={`gallery-${index}`}
              label={`Photo ${index + 1}`}
              websiteId={websiteId}
              value={image}
              onChange={(next) => onChange(next ? value.map((img, i) => (i === index ? next : img)) : value.filter((_, i) => i !== index))}
              errors={errors}
              errorPath={`gallery.${index}`}
              disabled={disabled}
            />
            {!disabled && value.length > 1 && (
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="sm" disabled={index === 0} title="Move earlier" onClick={() => move(index, -1)}>
                  <ArrowUp className="mr-1 h-3.5 w-3.5" />
                  Earlier
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={index === value.length - 1}
                  title="Move later"
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown className="mr-1 h-3.5 w-3.5" />
                  Later
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {!disabled && room > 0 && (
        <button
          type="button"
          disabled={!!progress}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            "flex h-20 w-full items-center justify-center gap-2 rounded-md border border-dashed border-input text-sm text-muted-foreground transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60",
            dragOver && "border-primary bg-primary/5",
          )}
        >
          {progress ? <Spinner /> : <ImagePlus className="h-5 w-5" />}
          {progress || `Add photos — click or drop up to ${room}`}
        </button>
      )}
      {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
      {errors.gallery && <p className="text-xs text-destructive">{errors.gallery}</p>}
    </div>
  );
}
