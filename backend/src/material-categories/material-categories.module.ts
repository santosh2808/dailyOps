import { Module } from '@nestjs/common';
import { MaterialCategoriesController } from './material-categories.controller';
import { MaterialCategoriesService } from './material-categories.service';

@Module({
  controllers: [MaterialCategoriesController],
  providers: [MaterialCategoriesService],
  exports: [MaterialCategoriesService],
})
export class MaterialCategoriesModule {}
