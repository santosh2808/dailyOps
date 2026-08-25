import { Module } from '@nestjs/common';
import { SalesOrdersModule } from '../sales-orders/sales-orders.module';
import { ProformaInvoicesModule } from '../proforma-invoices/proforma-invoices.module';
import { JobExecutionOrdersModule } from '../job-execution-orders/job-execution-orders.module';
import { ApprovalMatrixModule } from '../approval-matrix/approval-matrix.module';
import { MailerModule } from '../mailer/mailer.module';
import { PdfModule } from '../pdf/pdf.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { LeadsModule } from '../leads/leads.module';
import { QuotationsController } from './quotations.controller';
import { QuotationsService } from './quotations.service';

@Module({
  // SalesOrdersModule: automatic Sales Order creation on approval.
  // ProformaInvoicesModule/JobExecutionOrdersModule: the rest of the
  // Accepted-Quotation cascade (requirement — see performAccept()).
  // ApprovalMatrixModule: Price Validation / Approval Matrix gate.
  // MailerModule/PdfModule: Send Quotation. AuditLogModule: requirement #15.
  // LeadsModule: Lead Management Phase 1 — Generate Quotation from a Lead
  // and the QUOTATION_SENT status transition on Send Quotation (no
  // circular dependency: LeadsModule imports nothing back).
  imports: [
    SalesOrdersModule,
    ProformaInvoicesModule,
    JobExecutionOrdersModule,
    ApprovalMatrixModule,
    MailerModule,
    PdfModule,
    AuditLogModule,
    LeadsModule,
  ],
  controllers: [QuotationsController],
  providers: [QuotationsService],
})
export class QuotationsModule {}
