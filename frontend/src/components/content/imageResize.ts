// In-browser resize

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const MAX_SIDE = 2000;
const SHRINK_ABOVE = 1.5 * 1024 * 1024;

export async function prepareImage(file: File, { shareable = false }: { shareable?: boolean } = {}): Promise<File> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new Error("Please choose a JPG, PNG, WebP or AVIF image.");
  }
  const shareSafe = file.type === "image/jpeg" || file.type === "image/png";

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // server decides
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= SHRINK_ABOVE && (!shareable || shareSafe)) {
    bitmap.close();
    return finalCheck(file);
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return finalCheck(file);
  }
  if (shareable) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const toBlob = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  let blob = shareable ? null : await toBlob("image/webp", 0.82);
  if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg", 0.85);
  if (!blob || (blob.size >= file.size && (!shareable || shareSafe))) return finalCheck(file);

  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const name = `${file.name.replace(/\.[^.]+$/, "") || "image"}.${ext}`;
  return finalCheck(new File([blob], name, { type: blob.type }));
}

function finalCheck(file: File): File {
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    throw new Error(`This image is ${mb} MB even after resizing. The limit is 5 MB.`);
  }
  return file;
}
