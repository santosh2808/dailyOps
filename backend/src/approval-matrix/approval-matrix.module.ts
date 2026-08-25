import { Module } from '@nestjs/common';
import { ApprovalMatrixController } from './approval-matrix.controller';
import { ApprovalMatrixService } from './approval-matrix.service';

@Module({
  controllers: [ApprovalMatrixController],
  providers: [ApprovalMatrixService],
  // Exported so QuotationsModule (and any future module that adopts this
  // engine) can inject ApprovalMatrixService directly.
  exports: [ApprovalMatrixService],
})
export class ApprovalMatrixModule {}
