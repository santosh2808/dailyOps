import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CustomersModule } from './customers/customers.module';
import { ProductsModule } from './products/products.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { LeadsModule } from './leads/leads.module';
import { QuotationsModule } from './quotations/quotations.module';
import { SalesOrdersModule } from './sales-orders/sales-orders.module';
import { ProformaInvoicesModule } from './proforma-invoices/proforma-invoices.module';
import { TaxInvoicesModule } from './tax-invoices/tax-invoices.module';
import { JobExecutionOrdersModule } from './job-execution-orders/job-execution-orders.module';
import { MaterialCategoriesModule } from './material-categories/material-categories.module';
import { MaterialUnitsModule } from './material-units/material-units.module';
import { MaterialsModule } from './materials/materials.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { PermissionsModule } from './permissions/permissions.module';
import { RolesModule } from './roles/roles.module';
import { DepartmentsModule } from './departments/departments.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { ApprovalMatrixModule } from './approval-matrix/approval-matrix.module';
import { EmailTemplatesModule } from './email-templates/email-templates.module';
import { MailerModule } from './mailer/mailer.module';
import { PdfModule } from './pdf/pdf.module';
import { ComplaintsModule } from './complaints/complaints.module';
import { StateSeriesCodesModule } from './state-series-codes/state-series-codes.module';
import { FormConfigurationModule } from './form-configuration/form-configuration.module';
import { PublicFormsModule } from './public-forms/public-forms.module';
import { AiSettingsModule } from './ai-settings/ai-settings.module';
import { TelephonyModule } from './telephony/telephony.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Additive: powers LeadFollowUpReminderService's daily @Cron job (see
    // leads/lead-followup-reminder.service.ts) — the only scheduled job in
    // this app so far. No other module needs this registered separately;
    // @nestjs/schedule's ScheduleModule is a single global registration.
    ScheduleModule.forRoot(),
    PrismaModule,
    HealthModule,
    PermissionsModule,
    RolesModule,
    DepartmentsModule,
    UsersModule,
    AuthModule,
    CustomersModule,
    ProductsModule,
    DashboardModule,
    LeadsModule,
    QuotationsModule,
    SalesOrdersModule,
    ProformaInvoicesModule,
    TaxInvoicesModule,
    JobExecutionOrdersModule,
    StateSeriesCodesModule,
    MaterialCategoriesModule,
    MaterialUnitsModule,
    MaterialsModule,
    SuppliersModule,
    // Sales Automation (continuation of the DailyOps project) — additive.
    AuditLogModule,
    ApprovalMatrixModule,
    EmailTemplatesModule,
    MailerModule,
    PdfModule,
    ComplaintsModule,
    // Website Enquiries -> Lead/Complaint refactor — additive.
    FormConfigurationModule,
    PublicFormsModule,
    // D.O.T. AI Lead Assistant Phase 1 — foundation only, no telephony
    // integration. See ai-settings/ai-settings.module.ts.
    AiSettingsModule,
    // D.O.T. AI Lead Assistant Phase 2A — Telephony Test Foundation only.
    // EXOTEL_ENABLED defaults to false; no automated/Lead-triggered calling
    // exists anywhere in this module. See telephony/telephony.module.ts.
    TelephonyModule,
  ],
})
export class AppModule {}
