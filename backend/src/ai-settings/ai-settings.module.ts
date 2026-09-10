import { Module } from '@nestjs/common';
import { AiSettingsService } from './ai-settings.service';
import { AiSettingsController } from './ai-settings.controller';

@Module({
  controllers: [AiSettingsController],
  providers: [AiSettingsService],
})
export class AiSettingsModule {}
