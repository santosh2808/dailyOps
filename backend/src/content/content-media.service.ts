import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CONTENT_MEDIA_MAX_BYTES } from './content.constants';
import { contentMediaUrl, websiteMediaSegment } from './content-media';

type ImageType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';

const EXTENSION: Record<ImageType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

// Immutable cache
const MEDIA_CACHE_CONTROL = 'public, max-age=31536000, immutable';

// S3 image uploads
@Injectable()
export class ContentMediaService {
  private readonly logger = new Logger(ContentMediaService.name);
  private client?: S3Client;

  constructor(private auditLogService: AuditLogService) {}

  isConfigured(): boolean {
    return Boolean(this.bucket() && this.region() && process.env.CONTENT_MEDIA_PUBLIC_BASE_URL?.trim());
  }

  async upload(
    website: { id: string; code: string },
    file: Express.Multer.File | undefined,
    actorName?: string,
  ): Promise<{ key: string; url: string | null; contentType: string; sizeBytes: number }> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException({
        code: 'MEDIA_NOT_CONFIGURED',
        message: 'Image storage not configured. Ask an administrator to set the content media bucket.',
      });
    }
    if (!file || !file.buffer?.length) {
      throw new BadRequestException('No image was attached');
    }
    // Size double-check
    if (file.size > CONTENT_MEDIA_MAX_BYTES) {
      throw new BadRequestException(`Images must be ${CONTENT_MEDIA_MAX_BYTES / 1024 / 1024} MB or smaller`);
    }

    // Trust bytes only
    const detected = detectImageType(file.buffer);
    if (!detected) {
      throw new BadRequestException('Only JPG, PNG, WebP or AVIF images can be uploaded');
    }
    if (file.mimetype !== detected) {
      throw new BadRequestException('The file\'s contents do not match its type. Re-save it as JPG, PNG, WebP or AVIF and try again.');
    }

    const now = new Date();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const key = `content/${websiteMediaSegment(website.code)}/${now.getUTCFullYear()}/${month}/${randomUUID()}.${EXTENSION[detected]}`;

    try {
      await this.getClient().send(
        new PutObjectCommand({
          Bucket: this.bucket(),
          Key: key,
          Body: file.buffer,
          ContentType: detected,
          CacheControl: MEDIA_CACHE_CONTROL,
        }),
      );
    } catch (error) {
      this.logger.error(`S3 upload failed for ${key}`, error as Error);
      throw new ServiceUnavailableException({
        code: 'MEDIA_UPLOAD_FAILED',
        message: 'The image could not be stored right now. Please try again.',
      });
    }

    await this.auditLogService
      .record({
        module: 'Content',
        recordId: website.id,
        action: 'ImageUploaded',
        actorName,
        newValue: { key, contentType: detected, sizeBytes: file.size },
      })
      .catch((error) => this.logger.error('AuditLog record failed', error));

    return { key, url: contentMediaUrl(key), contentType: detected, sizeBytes: file.size };
  }

  private getClient(): S3Client {
    if (!this.client) {
      this.client = new S3Client({ region: this.region() });
    }
    return this.client;
  }

  private bucket() {
    return process.env.CONTENT_MEDIA_BUCKET?.trim() || undefined;
  }

  private region() {
    return process.env.CONTENT_MEDIA_REGION?.trim() || undefined;
  }
}

// Magic-byte check
export function detectImageType(bytes: Buffer): ImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  // ISO-BMFF brands
  if (bytes.length >= 16 && bytes.toString('ascii', 4, 8) === 'ftyp') {
    const boxSize = Math.min(bytes.readUInt32BE(0), bytes.length);
    const brands = [bytes.toString('ascii', 8, 12)];
    for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
      brands.push(bytes.toString('ascii', offset, offset + 4));
    }
    if (brands.includes('avif') || brands.includes('avis')) {
      return 'image/avif';
    }
  }
  return null;
}
