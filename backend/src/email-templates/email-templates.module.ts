import { Module } from '@nestjs/common';
import { EmailTemplatesController } from './email-templates.controller';
import { EmailTemplatesService } from './email-templates.service';

@Module({
  controllers: [EmailTemplatesController],
  providers: [EmailTemplatesService],
  // Exported so MailerService can look templates up by key.
  exports: [EmailTemplatesService],
})
export class EmailTemplatesModule {}
