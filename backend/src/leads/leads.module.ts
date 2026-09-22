import { Module } from '@nestjs/common';
import { MailerModule } from '../mailer/mailer.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { LeadFollowUpReminderService } from './lead-followup-reminder.service';

@Module({
  imports: [MailerModule, WhatsAppModule],
  controllers: [LeadsController],
  // LeadFollowUpReminderService is registered as a provider only (not
  // exported) — its @Cron job runs on its own once ScheduleModule.forRoot()
  // (app.module.ts) bootstraps it; nothing else in the app calls it
  // directly.
  providers: [LeadsService, LeadFollowUpReminderService],
  // Lead Management Phase 1: QuotationsService calls back into
  // LeadsService (Generate Quotation gating, the QUOTATION_SENT status
  // transition on Send Quotation) — see QuotationsModule's import of
  // LeadsModule.
  exports: [LeadsService],
})
export class LeadsModule {}
