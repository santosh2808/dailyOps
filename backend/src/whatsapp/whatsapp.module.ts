import { Module } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';

// Additive: WhatsApp Share (Interakt integration). Shared across
// QuotationsModule/ProformaInvoicesModule/TaxInvoicesModule/
// JobExecutionOrdersModule the same way MailerModule/PdfModule already
// are — one WhatsAppService instance, imported wherever a document needs
// to send itself over WhatsApp.
@Module({
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
