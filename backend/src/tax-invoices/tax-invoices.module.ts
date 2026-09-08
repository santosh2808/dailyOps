import { Module } from '@nestjs/common';
import { MailerModule } from '../mailer/mailer.module';
import { PdfModule } from '../pdf/pdf.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { TaxInvoicesController } from './tax-invoices.controller';
import { PublicTaxInvoicesController } from './public-tax-invoices.controller';
import { TaxInvoicesService } from './tax-invoices.service';

@Module({
  imports: [MailerModule, PdfModule, AuditLogModule, WhatsAppModule],
  // PublicTaxInvoicesController: WhatsApp Share's unauthenticated
  // /api/v1/public/tax-invoices/:token/pdf route. Shares this module's
  // TaxInvoicesService instance.
  controllers: [TaxInvoicesController, PublicTaxInvoicesController],
  providers: [TaxInvoicesService],
  exports: [TaxInvoicesService],
})
export class TaxInvoicesModule {}
