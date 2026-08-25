import { Module } from '@nestjs/common';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';

@Module({
  controllers: [AuditLogController],
  providers: [AuditLogService],
  // Exported so every other module that needs to record an audit entry
  // (Leads, Quotations, SalesOrders, ProformaInvoices, JobExecutionOrders,
  // Users) can inject AuditLogService directly.
  exports: [AuditLogService],
})
export class AuditLogModule {}
