import { Module } from '@nestjs/common';
import { MailerModule } from '../mailer/mailer.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

@Module({
  imports: [MailerModule, WhatsAppModule],
  controllers: [LeadsController],
  providers: [LeadsService],
  // Lead Management Phase 1: QuotationsService calls back into
  // LeadsService (Generate Quotation gating, the QUOTATION_SENT status
  // transition on Send Quotation) — see QuotationsModule's import of
  // LeadsModule.
  exports: [LeadsService],
})
export class LeadsModule {}
