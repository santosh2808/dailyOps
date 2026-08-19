import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CustomersModule } from './customers/customers.module';
import { ProductsModule } from './products/products.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { LeadsModule } from './leads/leads.module';
import { QuotationsModule } from './quotations/quotations.module';
import { SalesOrdersModule } from './sales-orders/sales-orders.module';
import { ProformaInvoicesModule } from './proforma-invoices/proforma-invoices.module';
import { JobExecutionOrdersModule } from './job-execution-orders/job-execution-orders.module';
import { MaterialCategoriesModule } from './material-categories/material-categories.module';
import { MaterialUnitsModule } from './material-units/material-units.module';
import { MaterialsModule } from './materials/materials.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { PermissionsModule } from './permissions/permissions.module';
import { RolesModule } from './roles/roles.module';
import { DepartmentsModule } from './departments/departments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
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
    JobExecutionOrdersModule,
    MaterialCategoriesModule,
    MaterialUnitsModule,
    MaterialsModule,
    SuppliersModule,
  ],
})
export class AppModule {}
