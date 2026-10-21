// Image key helpers
export const CONTENT_MEDIA_EXTENSIONS = ['jpg', 'png', 'webp', 'avif'] as const;

// content/<site>/<yyyy>/<mm>/<uuid>.<ext>
const MEDIA_KEY_PATTERN = /^content\/([a-z0-9][a-z0-9_-]*)\/\d{4}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|avif)$/;

export function websiteMediaSegment(websiteCode: string): string {
  return websiteCode.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
}

// Other website's key
export const FOREIGN_IMAGE_MESSAGE = 'Please upload the image through DailyOps';
export const FOREIGN_ARTICLE_IMAGE_MESSAGE = 'Article images must be uploaded through DailyOps';

export function isContentMediaKey(key: unknown, websiteCode: string): key is string {
  if (typeof key !== 'string') return false;
  const match = MEDIA_KEY_PATTERN.exec(key);
  return Boolean(match && match[1] === websiteMediaSegment(websiteCode));
}

export function contentMediaBaseUrl(): string | null {
  const base = process.env.CONTENT_MEDIA_PUBLIC_BASE_URL?.trim().replace(/\/+$/, '');
  return base || null;
}

export function contentMediaUrl(key: string): string | null {
  const base = contentMediaBaseUrl();
  return base ? `${base}/${key}` : null;
}

// Adds image URLs
export function withMediaUrls<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => withMediaUrls(item)) as unknown as T;
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const source = value as Record<string, unknown>;
  const copy: Record<string, unknown> = {};
  for (const [name, child] of Object.entries(source)) {
    copy[name] = withMediaUrls(child);
  }
  if (source.type === 'image' && source.attrs && typeof source.attrs === 'object') {
    const attrs = copy.attrs as Record<string, unknown>;
    delete attrs.url; // set by recursion
    if (typeof attrs.key === 'string') attrs.src = contentMediaUrl(attrs.key);
  } else if (typeof source.key === 'string' && !('type' in source)) {
    copy.url = contentMediaUrl(source.key);
  }
  return copy as T;
}
