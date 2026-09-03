import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { MailerModule } from '../mailer/mailer.module';
import { ComplaintsController } from './complaints.controller';
import { ComplaintsService } from './complaints.service';

@Module({
  imports: [AuditLogModule, MailerModule],
  controllers: [ComplaintsController],
  providers: [ComplaintsService],
  // Exported so DashboardModule can inject ComplaintsService if a future
  // widget needs more than the plain count DashboardService.getStats()
  // computes directly today.
  exports: [ComplaintsService],
})
export class ComplaintsModule {}
