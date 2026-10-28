import { mkdtemp, readdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createFileStore, LocalFileStore, S3FileStore } from '../../src/common/file-storage';

describe('S3FileStore', () => {
  function setup(response?: unknown | Error) {
    const send = jest.fn().mockImplementation(async () => {
      if (response instanceof Error) throw response;
      return response ?? {};
    });
    return { send, store: new S3FileStore({ send } as any, 'dailyops-files', 'lead-site-visit-photos') };
  }

  it('uploads under the area prefix with content type and encryption', async () => {
    const { send, store } = setup();
    await store.save('lead-1/abc.jpg', Buffer.from('img'), 'image/jpeg');
    const cmd = send.mock.calls[0][0];
    expect(cmd).toBeInstanceOf(PutObjectCommand);
    expect(cmd.input).toMatchObject({
      Bucket: 'dailyops-files',
      Key: 'lead-site-visit-photos/lead-1/abc.jpg',
      ContentType: 'image/jpeg',
      ServerSideEncryption: 'AES256',
    });
    expect(store.location).toBe('s3://dailyops-files/lead-site-visit-photos/');
    expect(store.persistent).toBe(true);
  });

  it('reads an object back', async () => {
    const { send, store } = setup({ Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) } });
    await expect(store.read('lead-1/abc.jpg')).resolves.toEqual(Buffer.from([1, 2, 3]));
    expect(send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
    expect(send.mock.calls[0][0].input.Key).toBe('lead-site-visit-photos/lead-1/abc.jpg');
  });

  it('returns null for a missing object instead of throwing', async () => {
    const { store } = setup(Object.assign(new Error('missing'), { name: 'NoSuchKey' }));
    await expect(store.read('lead-1/gone.jpg')).resolves.toBeNull();
  });

  it('rethrows other S3 errors (e.g. access denied)', async () => {
    const { store } = setup(Object.assign(new Error('denied'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } }));
    await expect(store.read('lead-1/abc.jpg')).rejects.toThrow('denied');
  });

  it('deletes under the area prefix', async () => {
    const { send, store } = setup();
    await store.remove('lead-1/abc.jpg');
    expect(send.mock.calls[0][0]).toBeInstanceOf(DeleteObjectCommand);
    expect(send.mock.calls[0][0].input).toEqual({ Bucket: 'dailyops-files', Key: 'lead-site-visit-photos/lead-1/abc.jpg' });
  });

  it('refuses unsafe keys without calling S3', async () => {
    const { send, store } = setup();
    for (const key of ['../secret', 'a/../b', '/abs.jpg', 'a//b', '']) {
      await expect(store.save(key, Buffer.from('x'), 'image/jpeg')).rejects.toThrow(/unsafe storage key/);
    }
    expect(send).not.toHaveBeenCalled();
  });
});

describe('LocalFileStore', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dailyops-store-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('saves into per-lead subfolders, reads back, and deletes', async () => {
    const store = new LocalFileStore(dir);
    await store.save('lead-1/abc.jpg', Buffer.from('img'), 'image/jpeg');
    expect(await readdir(join(dir, 'lead-1'))).toEqual(['abc.jpg']);
    await expect(store.read('lead-1/abc.jpg')).resolves.toEqual(Buffer.from('img'));
    await store.remove('lead-1/abc.jpg');
    await expect(store.read('lead-1/abc.jpg')).resolves.toBeNull();
    expect(store.persistent).toBe(false);
  });

  it('still reads pre-S3 photos stored as a bare file name', async () => {
    const store = new LocalFileStore(dir);
    await store.save('legacy-uuid.jpg', Buffer.from('old'), 'image/jpeg');
    await expect(store.read('legacy-uuid.jpg')).resolves.toEqual(Buffer.from('old'));
  });

  it('treats missing files as null and deleting them as a no-op', async () => {
    const store = new LocalFileStore(dir);
    await expect(store.read('nope.jpg')).resolves.toBeNull();
    await expect(store.remove('nope.jpg')).resolves.toBeUndefined();
  });

  it('refuses keys that escape the folder', async () => {
    const store = new LocalFileStore(dir);
    await expect(store.save('../escape.jpg', Buffer.from('x'), 'image/jpeg')).rejects.toThrow(/unsafe storage key/);
  });
});

describe('createFileStore', () => {
  const area = { prefix: 'lead-site-visit-photos', localDir: '/tmp/photos' };

  it('uses S3 when FILE_STORAGE_BUCKET is set', () => {
    const store = createFileStore(area, { FILE_STORAGE_BUCKET: 'dailyops-test-files', FILE_STORAGE_REGION: 'us-east-1' });
    expect(store).toBeInstanceOf(S3FileStore);
    expect(store.location).toBe('s3://dailyops-test-files/lead-site-visit-photos/');
  });

  it('falls back to the local folder when no bucket is configured', () => {
    for (const env of [{}, { FILE_STORAGE_BUCKET: '   ' }]) {
      const store = createFileStore(area, env);
      expect(store).toBeInstanceOf(LocalFileStore);
      expect(store.location).toBe('/tmp/photos');
    }
  });
});
