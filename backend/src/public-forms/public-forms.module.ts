import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { MailerModule } from '../mailer/mailer.module';
import { LeadsModule } from '../leads/leads.module';
import { ComplaintsModule } from '../complaints/complaints.module';
import { PublicFormsController } from './public-forms.controller';
import { PublicFormsService } from './public-forms.service';
import { FormSchemaValidatorService } from './form-schema-validator.service';

@Module({
  imports: [
    // Scoped to this module/controller only (via ThrottlerGuard on
    // PublicFormsController) — not applied globally in app.module.ts. 20
    // requests/minute per IP on the one anonymous, high-abuse-risk surface
    // in the app.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
    MailerModule,
    LeadsModule,
    ComplaintsModule,
  ],
  controllers: [PublicFormsController],
  providers: [PublicFormsService, FormSchemaValidatorService],
})
export class PublicFormsModule {}
