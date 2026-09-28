import { Module } from '@nestjs/common';
import { MailerModule } from '../mailer/mailer.module';
import { ApprovalRequestsModule } from './approval-requests.module';
import { SalesOrdersModule } from '../sales-orders/sales-orders.module';
import { ProformaInvoicesModule } from '../proforma-invoices/proforma-invoices.module';
import { JobExecutionOrdersModule } from '../job-execution-orders/job-execution-orders.module';
import { PublicApprovalsController } from './public-approvals.controller';
import { ApprovalDecisionsService } from './approval-decisions.service';

// The orchestrator half of the Override Approval workflow — depends on all
// three gate-owning modules (to call their applyApproved*() methods) plus
// ApprovalRequestsModule (to read/decide the request itself). Nothing
// depends back on THIS module, which is what avoids the circular-import
// that would otherwise occur — see ApprovalRequestsModule's own comment.
@Module({
  imports: [MailerModule, ApprovalRequestsModule, SalesOrdersModule, ProformaInvoicesModule, JobExecutionOrdersModule],
  controllers: [PublicApprovalsController],
  providers: [ApprovalDecisionsService],
})
export class ApprovalDecisionsModule {}
