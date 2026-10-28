import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { join } from 'path';
import { createFileStore, type FileStore } from '../common/file-storage';

export const SITE_VISIT_PHOTOS_PREFIX = 'lead-site-visit-photos';

// Site Visit photo files (see LeadsService.uploadSiteVisitPhotos). S3 when
// FILE_STORAGE_BUCKET is set — required in TEST/production — otherwise the
// local folder LEAD_SITE_VISIT_PHOTOS_DIR (default
// <backend cwd>/uploads/lead-site-visit-photos) for local development.
// Only metadata (incl. GPS) lives in Postgres (LeadSiteVisitPhoto).
@Injectable()
export class SiteVisitPhotoStorage implements OnModuleInit {
  private readonly logger = new Logger(SiteVisitPhotoStorage.name);
  readonly store: FileStore = createFileStore({
    prefix: SITE_VISIT_PHOTOS_PREFIX,
    localDir:
      process.env.LEAD_SITE_VISIT_PHOTOS_DIR?.trim() || join(process.cwd(), 'uploads', SITE_VISIT_PHOTOS_PREFIX),
  });

  onModuleInit() {
    this.logger.log(`Site visit photos are stored at ${this.store.location}`);
    if (!this.store.persistent && process.env.NODE_ENV === 'production') {
      this.logger.warn(
        'FILE_STORAGE_BUCKET is not set: site visit photos are going to the container disk, which is not ' +
          'writable by the app user and is wiped on every deploy. Set FILE_STORAGE_BUCKET/FILE_STORAGE_REGION.',
      );
    }
  }
}
