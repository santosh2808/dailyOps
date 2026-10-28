import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { promises as fs } from 'fs';
import { dirname, resolve, sep } from 'path';

// Where uploaded app files (site visit photos, and later PO documents) live.
//
// Deployed environments (TEST/production) must use S3: the backend runs in a
// container whose disk is root-owned (the app runs as `node`, so writes fail
// with EACCES) and is replaced on every deploy (so anything written there is
// lost). One private bucket holds every area under its own prefix:
//   s3://<FILE_STORAGE_BUCKET>/lead-site-visit-photos/<username>/<leadId>/<uuid>.jpg
//
// With no bucket configured (local development) files go to a folder on
// disk instead, exactly as before.
//
// Env:
//   FILE_STORAGE_BUCKET    bucket name; unset → local folder
//   FILE_STORAGE_REGION    bucket region (falls back to AWS_REGION)
//   FILE_STORAGE_ENDPOINT  optional S3-compatible endpoint (e.g. a local
//                          MinIO for testing); never set in AWS
// Credentials come from the standard AWS chain: the ECS task role in AWS,
// AWS_PROFILE / ~/.aws locally.

export interface FileStore {
  // Human-readable location, for startup logs ("s3://bucket/prefix/", "/dir").
  readonly location: string;
  readonly persistent: boolean;
  save(key: string, body: Buffer, contentType: string): Promise<void>;
  // null when the file doesn't exist (e.g. lost before S3 was introduced).
  read(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
}

// Keys are generated server-side (`<slug>/<uuid>/<uuid>.<ext>`); anything else
// is a bug, so refuse it rather than touch an unexpected path or object.
const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

function assertSafeKey(key: string) {
  if (!SAFE_KEY.test(key) || key.split('/').includes('..')) {
    throw new Error(`Refusing unsafe storage key "${key}"`);
  }
}

type S3Sender = Pick<S3Client, 'send'>;

export class S3FileStore implements FileStore {
  readonly persistent = true;
  readonly location: string;

  constructor(
    private readonly client: S3Sender,
    private readonly bucket: string,
    private readonly prefix: string,
  ) {
    this.location = `s3://${bucket}/${prefix}/`;
  }

  private objectKey(key: string) {
    assertSafeKey(key);
    return `${this.prefix}/${key}`;
  }

  async save(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.objectKey(key),
        Body: body,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
      }),
    );
  }

  async read(key: string) {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }));
      if (!res.Body) return null;
      return Buffer.from(await res.Body.transformToByteArray());
    } catch (error) {
      const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (err.name === 'NoSuchKey' || err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }));
  }
}

export class LocalFileStore implements FileStore {
  readonly persistent = false;
  readonly location: string;
  private readonly root: string;

  constructor(dir: string) {
    this.root = resolve(dir);
    this.location = this.root;
  }

  private path(key: string) {
    assertSafeKey(key);
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root + sep)) {
      throw new Error(`Refusing storage key outside ${this.root}: "${key}"`);
    }
    return full;
  }

  // contentType is only needed by S3; the local file keeps its extension.
  async save(key: string, body: Buffer, _contentType?: string) {
    const full = this.path(key);
    await fs.mkdir(dirname(full), { recursive: true });
    await fs.writeFile(full, body);
  }

  async read(key: string) {
    try {
      return await fs.readFile(this.path(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async remove(key: string) {
    try {
      await fs.unlink(this.path(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

export function createFileStore(
  area: { prefix: string; localDir: string },
  env: NodeJS.ProcessEnv = process.env,
): FileStore {
  const bucket = env.FILE_STORAGE_BUCKET?.trim();
  if (!bucket) return new LocalFileStore(area.localDir);

  const endpoint = env.FILE_STORAGE_ENDPOINT?.trim() || undefined;
  const client = new S3Client({
    region: env.FILE_STORAGE_REGION?.trim() || env.AWS_REGION?.trim() || undefined,
    endpoint,
    // S3-compatible test servers (MinIO) need path-style URLs.
    forcePathStyle: Boolean(endpoint),
  });
  return new S3FileStore(client, bucket, area.prefix);
}
