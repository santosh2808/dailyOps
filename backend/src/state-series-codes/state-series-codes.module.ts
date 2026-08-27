import { Module } from '@nestjs/common';
import { StateSeriesCodesController } from './state-series-codes.controller';
import { StateSeriesCodesService } from './state-series-codes.service';

@Module({
  controllers: [StateSeriesCodesController],
  providers: [StateSeriesCodesService],
  // Exported so JobExecutionOrdersModule can call claimNextNumber() as part
  // of state-wise JEO numbering (see JobExecutionOrdersService.generateJeoNumber()).
  exports: [StateSeriesCodesService],
})
export class StateSeriesCodesModule {}
