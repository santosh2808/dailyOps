import { Module } from '@nestjs/common';
import { MailerModule } from '../mailer/mailer.module';
import { PdfModule } from '../pdf/pdf.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { TaxInvoicesController } from './tax-invoices.controller';
import { TaxInvoicesService } from './tax-invoices.service';

@Module({
  imports: [MailerModule, PdfModule, AuditLogModule],
  controllers: [TaxInvoicesController],
  providers: [TaxInvoicesService],
  exports: [TaxInvoicesService],
})
export class TaxInvoicesModule {}
