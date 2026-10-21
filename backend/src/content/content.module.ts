import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { ContentTemplateValidatorService } from './content-template-validator.service';
import { ContentMediaService } from './content-media.service';

@Module({
  imports: [AuditLogModule],
  controllers: [ContentController],
  providers: [ContentService, ContentTemplateValidatorService, ContentMediaService],
})
export class ContentModule {}
