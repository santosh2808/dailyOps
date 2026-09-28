import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MailerModule } from '../mailer/mailer.module';
import { ApprovalRequestsService } from './approval-requests.service';

// Deliberately the "core" half only — create + read + status-write helpers,
// depending on nothing but Prisma/Mailer. SalesOrdersModule,
// ProformaInvoicesModule and JobExecutionOrdersModule each import THIS
// module (one-directionally) to call createRequest() from inside their own
// gate checks. The public-facing approve/reject orchestrator that calls
// back INTO those three modules lives in the separate ApprovalDecisionsModule
// instead — splitting it this way avoids a circular module dependency that
// would otherwise occur (those three modules needing this one, and this one
// needing to call back into all three).
@Module({
  imports: [PrismaModule, MailerModule],
  providers: [ApprovalRequestsService],
  exports: [ApprovalRequestsService],
})
export class ApprovalRequestsModule {}
