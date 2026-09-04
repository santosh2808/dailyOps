import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { FormConfigurationController } from './form-configuration.controller';
import { FormConfigurationService } from './form-configuration.service';

@Module({
  imports: [AuditLogModule],
  controllers: [FormConfigurationController],
  providers: [FormConfigurationService],
  // Exported so PublicFormsModule can look up a website/form's
  // enabled/active state, latest published version, product mappings, and
  // subject routes at public-submission time.
  exports: [FormConfigurationService],
})
export class FormConfigurationModule {}
