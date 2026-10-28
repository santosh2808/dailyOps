import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { LeadsService } from '../../src/leads/leads.service';
import type { FileStore } from '../../src/common/file-storage';

const GPS = { latitude: 17.385, longitude: 78.4867, accuracyMeters: 12 };

function photo(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    originalname: 'site.jpg',
    mimetype: 'image/jpeg',
    size: 1024,
    buffer: Buffer.from('jpeg-bytes'),
    ...overrides,
  } as Express.Multer.File;
}

function setup(opts: { save?: jest.Mock; create?: jest.Mock; read?: jest.Mock } = {}) {
  const store: FileStore & { save: jest.Mock; read: jest.Mock; remove: jest.Mock } = {
    location: 's3://dailyops-test-files/lead-site-visit-photos/',
    persistent: true,
    save: opts.save ?? jest.fn().mockResolvedValue(undefined),
    read: opts.read ?? jest.fn().mockResolvedValue(Buffer.from('jpeg-bytes')),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const prisma: any = {
    leadSiteVisitPhoto: {
      create: opts.create ?? jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'p1', createdAt: new Date(), ...data })),
      findFirst: jest.fn().mockResolvedValue({ id: 'p1', leadId: 'lead-1', fileName: 'lead-1/abc.jpg', mimeType: 'image/jpeg', originalName: 'site.jpg' }),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
  const svc = new LeadsService(prisma, {} as any, {} as any, { store } as any);
  jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 'lead-1' } as any);
  jest.spyOn((svc as any).logger, 'error').mockImplementation(() => undefined);
  return { svc, store, prisma };
}

describe('Site visit photo upload', () => {
  it('stores the file, then saves the row with the GPS fix and a per-lead key', async () => {
    const { svc, store, prisma } = setup();
    const result = await svc.uploadSiteVisitPhotos('lead-1', [photo()], 'Pavan Kumar', GPS, 'pavan');

    const [key, body, type] = store.save.mock.calls[0];
    expect(key).toMatch(/^pavan\/lead-1\/[0-9a-f-]{36}\.jpg$/);
    expect(body).toEqual(Buffer.from('jpeg-bytes'));
    expect(type).toBe('image/jpeg');

    const data = prisma.leadSiteVisitPhoto.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ leadId: 'lead-1', fileName: key, uploadedBy: 'Pavan Kumar', latitude: 17.385, longitude: 78.4867, accuracyMeters: 12 });
    expect(store.save.mock.invocationCallOrder[0]).toBeLessThan(prisma.leadSiteVisitPhoto.create.mock.invocationCallOrder[0]);
    expect(result).toHaveLength(1);
  });

  it('stores accuracy as null when the device does not report it', async () => {
    const { svc, prisma } = setup();
    await svc.uploadSiteVisitPhotos('lead-1', [photo()], 'Pavan', { latitude: 17.385, longitude: 78.4867 });
    expect(prisma.leadSiteVisitPhoto.create.mock.calls[0][0].data.accuracyMeters).toBeNull();
  });

  it('rejects uploads without a valid location before storing anything', async () => {
    for (const location of [undefined, { latitude: 17.4 }, { latitude: NaN, longitude: 78 }, { latitude: 91, longitude: 78 }]) {
      const { svc, store, prisma } = setup();
      await expect(svc.uploadSiteVisitPhotos('lead-1', [photo()], 'Pavan', location as any)).rejects.toBeInstanceOf(BadRequestException);
      expect(store.save).not.toHaveBeenCalled();
      expect(prisma.leadSiteVisitPhoto.create).not.toHaveBeenCalled();
    }
  });

  it('validates every file before storing any (no partial uploads)', async () => {
    const { svc, store } = setup();
    const files = [photo(), photo({ originalname: 'notes.pdf', mimetype: 'application/pdf' })];
    await expect(svc.uploadSiteVisitPhotos('lead-1', files, 'Pavan', GPS)).rejects.toThrow(/not a supported image type/);
    await expect(svc.uploadSiteVisitPhotos('lead-1', [photo({ size: 16 * 1024 * 1024 })], 'Pavan', GPS)).rejects.toThrow(/15MB/);
    expect(store.save).not.toHaveBeenCalled();
  });

  it('returns 503 and writes no row (no GPS saved) when storage fails', async () => {
    const { svc, prisma } = setup({ save: jest.fn().mockRejectedValue(new Error('EACCES: permission denied')) });
    await expect(svc.uploadSiteVisitPhotos('lead-1', [photo()], 'Pavan', GPS)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.leadSiteVisitPhoto.create).not.toHaveBeenCalled();
  });

  it('removes the stored file when the row cannot be written', async () => {
    const { svc, store } = setup({ create: jest.fn().mockRejectedValue(new Error('db down')) });
    await expect(svc.uploadSiteVisitPhotos('lead-1', [photo()], 'Pavan', GPS)).rejects.toThrow('db down');
    expect(store.remove).toHaveBeenCalledWith(store.save.mock.calls[0][0]);
  });

  it('never trusts the browser file name for the key', async () => {
    const { svc, store } = setup();
    await svc.uploadSiteVisitPhotos('lead-1', [photo({ originalname: '../../evil.sh;.JPEG', mimetype: 'image/jpeg' })], 'Pavan', GPS, 'pavan');
    await svc.uploadSiteVisitPhotos('lead-1', [photo({ originalname: 'IMG_0001.HEIC', mimetype: 'image/heic' })], 'Pavan', GPS, 'pavan');
    expect(store.save.mock.calls[0][0]).toMatch(/^pavan\/lead-1\/[0-9a-f-]{36}\.jpeg$/);
    expect(store.save.mock.calls[1][0]).toMatch(/^pavan\/lead-1\/[0-9a-f-]{36}\.heic$/);
  });
});

describe('Site visit photo storage path', () => {
  it('keeps clean usernames as they are', () => {
    expect(LeadsService.storageUserSegment('pavan')).toBe('pavan');
    expect(LeadsService.storageUserSegment('sreejitha.g')).toBe('sreejitha.g');
    expect(LeadsService.storageUserSegment('sales_exec-01')).toBe('sales_exec-01');
  });

  it('makes any username a safe single folder name', () => {
    expect(LeadsService.storageUserSegment('Pavan Kumar')).toBe('pavan-kumar');
    expect(LeadsService.storageUserSegment('ravi@example.com')).toBe('ravi-example.com');
    expect(LeadsService.storageUserSegment('../../etc')).toBe('etc');
    expect(LeadsService.storageUserSegment('a'.repeat(63) + '-----b')).toBe('a'.repeat(63));
    for (const empty of [undefined, null, '', '   ', '///', '...']) {
      expect(LeadsService.storageUserSegment(empty)).toBe('unknown-user');
    }
  });

  it('files photos under username, then lead', async () => {
    const { svc, store } = setup();
    await svc.uploadSiteVisitPhotos('lead-1', [photo({ originalname: 'site.PNG', mimetype: 'image/png' })], 'Ravi', GPS, 'Ravi.K');
    expect(store.save.mock.calls[0][0]).toMatch(/^ravi\.k\/lead-1\/[0-9a-f-]{36}\.png$/);
  });

  it('still uploads when the username is unavailable', async () => {
    const { svc, store } = setup();
    await svc.uploadSiteVisitPhotos('lead-1', [photo()], 'Ravi', GPS);
    expect(store.save.mock.calls[0][0]).toMatch(/^unknown-user\/lead-1\/[0-9a-f-]{36}\.jpg$/);
  });
});

describe('Site visit photo view and delete', () => {
  it('streams the stored bytes with the saved type', async () => {
    const { svc, store } = setup();
    await expect(svc.getSiteVisitPhotoFile('lead-1', 'p1')).resolves.toEqual({
      buffer: Buffer.from('jpeg-bytes'),
      mimeType: 'image/jpeg',
      originalName: 'site.jpg',
    });
    expect(store.read).toHaveBeenCalledWith('lead-1/abc.jpg');
  });

  it('answers 404 (not a 500 crash) when the file no longer exists', async () => {
    const { svc } = setup({ read: jest.fn().mockResolvedValue(null) });
    await expect(svc.getSiteVisitPhotoFile('lead-1', 'p1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes the row, then the stored file; a failed file delete does not fail the request', async () => {
    const { svc, store, prisma } = setup();
    store.remove.mockRejectedValueOnce(new Error('S3 hiccup'));
    jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined);
    await expect(svc.deleteSiteVisitPhoto('lead-1', 'p1')).resolves.toEqual({ success: true });
    expect(prisma.leadSiteVisitPhoto.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    expect(store.remove).toHaveBeenCalledWith('lead-1/abc.jpg');
  });
});
