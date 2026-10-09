import { Module } from '@nestjs/common';
import { MailerModule } from '../mailer/mailer.module';
import { PdfModule } from '../pdf/pdf.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { ApprovalRequestsModule } from '../approval-requests/approval-requests.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { SalesOrdersController } from './sales-orders.controller';
import { SalesOrdersService } from './sales-orders.service';

@Module({
  // QA feature (SC-013): WhatsAppModule added so SalesOrdersService can send
  // the customer-relevant-status-change WhatsApp message alongside the
  // existing email, same "email + WhatsApp, independent best-effort sends"
  // pattern LeadsModule already uses for Lead assignment / Site Visit.
  // PdfModule: QA fix — Sales Order confirmation/update emails had no PDF
  // attachment (see SalesOrdersService.getPdf()/sendOrderConfirmationEmail()
  // /sendSalesOrder()).
  imports: [MailerModule, PdfModule, AuditLogModule, ApprovalRequestsModule, WhatsAppModule],
  controllers: [SalesOrdersController],
  providers: [SalesOrdersService],
  // Exported so QuotationsModule can inject SalesOrdersService directly and
  // call createFromQuotation() when a Quotation is approved — see
  // QuotationsService.updateStatus().
  exports: [SalesOrdersService],
})
export class SalesOrdersModule {}
