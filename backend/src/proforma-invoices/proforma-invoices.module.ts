import { Module } from '@nestjs/common';
import { MailerModule } from '../mailer/mailer.module';
import { PdfModule } from '../pdf/pdf.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { ProformaInvoicesController } from './proforma-invoices.controller';
import { ProformaInvoicesService } from './proforma-invoices.service';

@Module({
  imports: [MailerModule, PdfModule, AuditLogModule],
  controllers: [ProformaInvoicesController],
  providers: [ProformaInvoicesService],
  // Exported so QuotationsModule can call createFromSalesOrder() as part
  // of the Accepted-Quotation cascade.
  exports: [ProformaInvoicesService],
})
export class ProformaInvoicesModule {}
