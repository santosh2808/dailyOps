import { HttpException } from '@nestjs/common';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { ContentMediaService, detectImageType } from '../../src/content/content-media.service';
import { isContentMediaKey, withMediaUrls } from '../../src/content/content-media';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
const AVIF = Buffer.concat([Buffer.from([0, 0, 0, 0x1c]), Buffer.from('ftypavif'), Buffer.from([0, 0, 0, 0]), Buffer.from('avifmif1miaf')]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const GIF = Buffer.from('GIF89a......');

const ENV = ['CONTENT_MEDIA_BUCKET', 'CONTENT_MEDIA_REGION', 'CONTENT_MEDIA_PUBLIC_BASE_URL'] as const;

function file(buffer: Buffer, mimetype: string): Express.Multer.File {
  return { buffer, mimetype, size: buffer.length, originalname: 'photo' } as Express.Multer.File;
}

async function caught(promise: Promise<unknown>): Promise<HttpException> {
  try {
    await promise;
  } catch (error) {
    return error as HttpException;
  }
  throw new Error('expected the call to throw');
}

describe('detectImageType', () => {
  it('recognises JPG, PNG, WebP and AVIF by their bytes', () => {
    expect(detectImageType(JPEG)).toBe('image/jpeg');
    expect(detectImageType(PNG)).toBe('image/png');
    expect(detectImageType(WEBP)).toBe('image/webp');
    expect(detectImageType(AVIF)).toBe('image/avif');
  });

  it('rejects SVG, GIF and anything else', () => {
    expect(detectImageType(SVG)).toBeNull();
    expect(detectImageType(GIF)).toBeNull();
    expect(detectImageType(Buffer.from('%PDF-1.7'))).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe('ContentMediaService', () => {
  const saved: Record<string, string | undefined> = {};
  const website = { id: 'w1', code: 'SPYRO' };

  beforeEach(() => {
    for (const name of ENV) saved[name] = process.env[name];
    process.env.CONTENT_MEDIA_BUCKET = 'spyro-content-media';
    process.env.CONTENT_MEDIA_REGION = 'ap-south-1';
    process.env.CONTENT_MEDIA_PUBLIC_BASE_URL = 'https://media.example.com/';
  });
  afterEach(() => {
    for (const name of ENV) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });

  function setup() {
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const svc = new ContentMediaService(audit as any);
    const send = jest.fn().mockResolvedValue({});
    (svc as any).client = { send };
    return { svc, send, audit };
  }

  it.each(ENV)('answers 503 "not configured" while %s is unset, without touching S3', async (name) => {
    delete process.env[name];
    const { svc, send } = setup();
    const error = await caught(svc.upload(website, file(JPEG, 'image/jpeg')));
    expect(error.getStatus()).toBe(503);
    expect((error.getResponse() as { code: string }).code).toBe('MEDIA_NOT_CONFIGURED');
    expect(send).not.toHaveBeenCalled();
  });

  it('stores a valid image under an unguessable key for its website and returns key + public URL', async () => {
    const { svc, send, audit } = setup();
    const result = await svc.upload(website, file(PNG, 'image/png'), 'Divya');

    expect(isContentMediaKey(result.key, 'SPYRO')).toBe(true);
    expect(result.key).toMatch(/^content\/spyro\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/);
    expect(result.url).toBe(`https://media.example.com/${result.key}`);

    const command = send.mock.calls[0][0] as PutObjectCommand;
    expect(command.input).toMatchObject({
      Bucket: 'spyro-content-media',
      Key: result.key,
      ContentType: 'image/png',
      CacheControl: 'public, max-age=31536000, immutable',
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ module: 'Content', action: 'ImageUploaded', recordId: 'w1' }));
  });

  it.each([
    ['an SVG', SVG, 'image/svg+xml'],
    ['a GIF', GIF, 'image/gif'],
    ['a PDF renamed .jpg', Buffer.from('%PDF-1.7 ....'), 'image/jpeg'],
    ['a PNG claiming to be a JPEG', PNG, 'image/jpeg'],
  ])('rejects %s with 400 and never uploads it', async (_label, buffer, mimetype) => {
    const { svc, send } = setup();
    const error = await caught(svc.upload(website, file(buffer, mimetype)));
    expect(error.getStatus()).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects a missing or oversized file', async () => {
    const { svc } = setup();
    expect((await caught(svc.upload(website, undefined))).getStatus()).toBe(400);
    const big = { ...file(JPEG, 'image/jpeg'), size: 6 * 1024 * 1024 };
    expect((await caught(svc.upload(website, big))).getStatus()).toBe(400);
  });

  it('turns an S3 failure into a clear 503 and records no audit entry', async () => {
    const { svc, send, audit } = setup();
    send.mockRejectedValue(new Error('AccessDenied'));
    jest.spyOn((svc as any).logger, 'error').mockImplementation(() => undefined);
    const error = await caught(svc.upload(website, file(JPEG, 'image/jpeg')));
    expect(error.getStatus()).toBe(503);
    expect((error.getResponse() as { code: string }).code).toBe('MEDIA_UPLOAD_FAILED');
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe('withMediaUrls', () => {
  const key = 'content/spyro/2026/10/3f0c2a9e-0a4b-4c7e-9a51-2d8f1b6c9e10.jpg';
  afterEach(() => delete process.env.CONTENT_MEDIA_PUBLIC_BASE_URL);

  it('adds url to stored images and src to article images, without changing the input', () => {
    process.env.CONTENT_MEDIA_PUBLIC_BASE_URL = 'https://media.example.com';
    const data = {
      coverImage: { key, alt: 'x' },
      gallery: [{ key }],
      body: { type: 'doc', content: [{ type: 'image', attrs: { key, alt: 'y' } }] },
    };
    const out = withMediaUrls(data) as any;
    expect(out.coverImage).toEqual({ key, alt: 'x', url: `https://media.example.com/${key}` });
    expect(out.gallery[0].url).toBe(`https://media.example.com/${key}`);
    expect(out.body.content[0].attrs).toEqual({ key, alt: 'y', src: `https://media.example.com/${key}` });
    expect(data.coverImage).not.toHaveProperty('url');
  });

  it('gives null URLs while the public base URL is unset', () => {
    expect((withMediaUrls({ coverImage: { key } }) as any).coverImage.url).toBeNull();
  });
});
