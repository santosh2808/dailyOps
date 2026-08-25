import { Module } from '@nestjs/common';
import { EmailTemplatesModule } from '../email-templates/email-templates.module';
import { MailerService } from './mailer.service';

@Module({
  imports: [EmailTemplatesModule],
  providers: [MailerService],
  exports: [MailerService],
})
export class MailerModule {}
