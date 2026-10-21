import { useRef, useState, type DragEvent } from "react";
import { ImagePlus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errors";
import { toContentImage, uploadContentImage } from "@/api/content";
import { ACCEPTED_IMAGE_TYPES, prepareImage } from "./imageResize";
import { LIMITS, errorsUnder } from "./contentOptions";
import type { ContentImage } from "@/types";

interface ImageFieldProps {
  id: string;
  label: string;
  websiteId: string;
  value: ContentImage | null;
  onChange: (value: ContentImage | null) => void;
  errors: Record<string, string>;
  // Error path
  errorPath: string;
  disabled?: boolean;
  required?: boolean;
  // Keep JPEG/PNG
  shareable?: boolean;
  help?: string;
}

// Single image upload
export default function ImageField({
  id,
  label,
  websiteId,
  value,
  onChange,
  errors,
  errorPath,
  disabled,
  required,
  shareable,
  help,
}: ImageFieldProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fieldErrors = errorsUnder(errors, errorPath);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploadError("");
    setUploading(true);
    try {
      const prepared = await prepareImage(file, { shareable });
      const uploaded = await uploadContentImage(websiteId, prepared);
      onChange(toContentImage(uploaded, value?.alt ?? ""));
    } catch (err) {
      setUploadError(err instanceof Error && !("response" in err) ? err.message : getErrorMessage(err, "Upload failed. Please try again."));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function handleDrop(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    setDragOver(false);
    if (!disabled && !uploading) handleFile(e.dataTransfer.files[0]);
  }

  return (
    <div className="space-y-2" data-error-key={errorPath}>
      <Label htmlFor={id}>
        {label}
        {required && " *"}
      </Label>
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {value ? (
        <div className="flex flex-wrap gap-3 rounded-md border border-input p-3">
          <div className="flex h-24 w-32 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-100">
            {value.url ? (
              <img src={value.url} alt={value.alt ?? ""} className="h-full w-full object-cover" />
            ) : (
              <span className="px-2 text-center text-xs text-muted-foreground">Preview unavailable</span>
            )}
          </div>
          {/* Wraps when narrow */}
          <div className="min-w-0 flex-1 basis-48 space-y-2">
            <Input
              id={id}
              value={value.alt ?? ""}
              maxLength={LIMITS.imageAlt}
              disabled={disabled}
              placeholder="Describe the image, e.g. Two HVLS fans above a packing line"
              onChange={(e) => onChange({ ...value, alt: e.target.value })}
            />
            {!disabled && (
              <div className="flex flex-wrap gap-1">
                <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  {uploading ? <Spinner className="mr-2 h-4 w-4" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Replace
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
                  <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                  Remove
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <button
          id={id}
          type="button"
          disabled={disabled || uploading}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            "flex h-28 w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-input text-sm text-muted-foreground transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60",
            dragOver && "border-primary bg-primary/5",
          )}
        >
          {uploading ? <Spinner /> : <ImagePlus className="h-5 w-5" />}
          {uploading ? "Uploading..." : "Click or drop an image (JPG, PNG, WebP, AVIF)"}
        </button>
      )}
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
      {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
      {fieldErrors.map((message) => (
        <p key={message} className="text-xs text-destructive">
          {message}
        </p>
      ))}
    </div>
  );
}
