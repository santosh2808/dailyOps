import { Module } from '@nestjs/common';
import { MaterialUnitsController } from './material-units.controller';
import { MaterialUnitsService } from './material-units.service';

@Module({
  controllers: [MaterialUnitsController],
  providers: [MaterialUnitsService],
  exports: [MaterialUnitsService],
})
export class MaterialUnitsModule {}
