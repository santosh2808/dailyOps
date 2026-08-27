import { Module } from '@nestjs/common';
import { MailerModule } from '../mailer/mailer.module';
import { PdfModule } from '../pdf/pdf.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { StateSeriesCodesModule } from '../state-series-codes/state-series-codes.module';
import { JobExecutionOrdersController } from './job-execution-orders.controller';
import { JobExecutionOrdersService } from './job-execution-orders.service';

@Module({
  imports: [MailerModule, PdfModule, AuditLogModule, StateSeriesCodesModule],
  controllers: [JobExecutionOrdersController],
  providers: [JobExecutionOrdersService],
  // Exported so QuotationsModule can call createFromSalesOrder() as part
  // of the Accepted-Quotation cascade.
  exports: [JobExecutionOrdersService],
})
export class JobExecutionOrdersModule {}
