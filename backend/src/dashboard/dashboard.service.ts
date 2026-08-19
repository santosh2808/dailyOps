import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface DashboardStats {
  customers: number;
  products: number;
  leads: number;
  quotations: number;
  salesOrders: number;
  proformaInvoices: number;
  jeoPending: number;
  materialsCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  suppliers: number;
}

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats(): Promise<DashboardStats> {
    const [
      customers,
      products,
      leads,
      quotations,
      salesOrders,
      proformaInvoices,
      jeoPending,
      materialsCount,
      outOfStockCount,
      lowStockCandidates,
      suppliers,
    ] = await Promise.all([
      this.prisma.customer.count({ where: { isActive: true } }),
      this.prisma.product.count({ where: { isActive: true } }),
      // Lead, Quotation, and SalesOrder all use deletedAt (not isActive) for
      // soft delete, matching the convention in their own findAll() methods.
      // Excludes soft-deleted rows so these counts stay in sync with their
      // respective list pages.
      this.prisma.lead.count({ where: { deletedAt: null } }),
      this.prisma.quotation.count({ where: { deletedAt: null } }),
      this.prisma.salesOrder.count({ where: { deletedAt: null } }),
      // ProformaInvoice has no deletedAt/isActive column (see schema.prisma
      // comment) — CANCELLED is its equivalent "no longer active" state, so
      // this excludes cancelled invoices instead.
      this.prisma.proformaInvoice.count({ where: { status: { not: 'CANCELLED' } } }),
      // "JEO Pending Count" per scope — literally status === PENDING (JEOs
      // that haven't started production at all yet), not "not completed".
      this.prisma.jobExecutionOrder.count({ where: { status: 'PENDING' } }),
      this.prisma.material.count({ where: { isActive: true } }),
      // Out Of Stock: currentStock <= 0 — a single-column comparison, so a
      // direct count works.
      this.prisma.material.count({ where: { isActive: true, currentStock: { lte: 0 } } }),
      // Low Stock: 0 < currentStock <= reorderLevel — this compares two
      // columns against each other, which Prisma's `where` cannot express
      // directly. Fetch the (small) set of active, non-zero-stock materials
      // and filter in memory, same approach used in
      // materials.service.ts findAll() for the identical comparison.
      this.prisma.material.findMany({
        where: { isActive: true, currentStock: { gt: 0 } },
        select: { currentStock: true, reorderLevel: true },
      }),
      // Supplier uses deletedAt (not isActive) for soft delete, same
      // convention as Lead/Quotation/SalesOrder — excludes soft-deleted
      // rows so this count stays in sync with the Supplier list page.
      this.prisma.supplier.count({ where: { deletedAt: null } }),
    ]);

    const lowStockCount = lowStockCandidates.filter(
      (material) => material.currentStock <= material.reorderLevel,
    ).length;

    return {
      customers,
      products,
      leads,
      quotations,
      salesOrders,
      proformaInvoices,
      jeoPending,
      materialsCount,
      lowStockCount,
      outOfStockCount,
      suppliers,
    };
  }
}
