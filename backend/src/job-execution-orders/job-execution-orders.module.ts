import { Module } from '@nestjs/common';
import { JobExecutionOrdersController } from './job-execution-orders.controller';
import { JobExecutionOrdersService } from './job-execution-orders.service';

@Module({
  controllers: [JobExecutionOrdersController],
  providers: [JobExecutionOrdersService],
})
export class JobExecutionOrdersModule {}
