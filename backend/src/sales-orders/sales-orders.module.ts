import { Module } from '@nestjs/common';
import { MailerModule } from '../mailer/mailer.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { SalesOrdersController } from './sales-orders.controller';
import { SalesOrdersService } from './sales-orders.service';

@Module({
  imports: [MailerModule, AuditLogModule],
  controllers: [SalesOrdersController],
  providers: [SalesOrdersService],
  // Exported so QuotationsModule can inject SalesOrdersService directly and
  // call createFromQuotation() when a Quotation is approved — see
  // QuotationsService.updateStatus().
  exports: [SalesOrdersService],
})
export class SalesOrdersModule {}
