import { Module } from '@nestjs/common';
import { MailerModule } from '../mailer/mailer.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [MailerModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  // Exported so the modules whose actions notify someone (Leads,
  // Quotations) can inject NotificationsService directly.
  exports: [NotificationsService],
})
export class NotificationsModule {}
