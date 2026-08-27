import { Module } from '@nestjs/common';
import { MailerModule } from '../mailer/mailer.module';
import { PdfModule } from '../pdf/pdf.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { StateSeriesCodesModule } from '../state-series-codes/state-series-codes.module';
import { SalesOrdersModule } from '../sales-orders/sales-orders.module';
import { JobExecutionOrdersController } from './job-execution-orders.controller';
import { JobExecutionOrdersService } from './job-execution-orders.service';

@Module({
  // SalesOrdersModule: so a JEO reaching READY_FOR_DISPATCH/COMPLETED can
  // auto-advance its linked Sales Order (see updateStatus() below) — no
  // circular dependency, SalesOrdersModule doesn't import this module.
  imports: [MailerModule, PdfModule, AuditLogModule, StateSeriesCodesModule, SalesOrdersModule],
  controllers: [JobExecutionOrdersController],
  providers: [JobExecutionOrdersService],
  // Exported so QuotationsModule can call createFromSalesOrder() as part
  // of the Accepted-Quotation cascade.
  exports: [JobExecutionOrdersService],
})
export class JobExecutionOrdersModule {}
