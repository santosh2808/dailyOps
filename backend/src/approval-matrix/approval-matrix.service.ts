import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateApprovalMatrixDto } from './dto/create-approval-matrix.dto';
import { UpdateApprovalMatrixDto } from './dto/update-approval-matrix.dto';
import { PrismaService } from '../prisma/prisma.service';

const MATRIX_INCLUDE = { requiredRole: true } as const;

// Configurable Approval Matrix engine (requirement #9 — "No hardcoding...
// Future modules should reuse this engine"). A `module` string (e.g.
// "Quotation") plus a discount-percent value resolves to the Role required
// to approve at that bracket, entirely from data in the ApprovalMatrix
// table — nothing about the brackets or roles is hardcoded in application
// code. Any future module (Sales Order discounting, Purchase Order
// approval, etc.) can call resolveRequiredRole() with its own `module`
// name and reuse this exact same table/service.
@Injectable()
export class ApprovalMatrixService {
  constructor(private prisma: PrismaService) {}

  findAll(module?: string) {
    return this.prisma.approvalMatrix.findMany({
      where: module ? { module } : undefined,
      include: MATRIX_INCLUDE,
      orderBy: [{ module: 'asc' }, { minPercent: 'asc' }],
    });
  }

  async findOne(id: string) {
    const entry = await this.prisma.approvalMatrix.findUnique({
      where: { id },
      include: MATRIX_INCLUDE,
    });
    if (!entry) {
      throw new NotFoundException('Approval matrix entry not found');
    }
    return entry;
  }

  create(dto: CreateApprovalMatrixDto) {
    return this.prisma.approvalMatrix.create({
      data: {
        module: dto.module,
        minPercent: dto.minPercent,
        maxPercent: dto.maxPercent,
        requiredRoleId: dto.requiredRoleId,
        isActive: dto.isActive ?? true,
      },
      include: MATRIX_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateApprovalMatrixDto) {
    await this.findOne(id);
    return this.prisma.approvalMatrix.update({
      where: { id },
      data: { ...dto },
      include: MATRIX_INCLUDE,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.approvalMatrix.delete({ where: { id } });
  }

  // The engine itself: given a module name and a discount percentage,
  // returns the active bracket that percentage falls into (min <= percent <
  // max), or null if no bracket is configured to cover it (callers treat
  // "no bracket configured" as "no extra approval required" — the matrix is
  // opt-in per module, not a hard gate that blocks everything until
  // configured).
  async resolveRequiredRole(module: string, percent: number) {
    const entries = await this.prisma.approvalMatrix.findMany({
      where: { module, isActive: true },
      include: MATRIX_INCLUDE,
      orderBy: { minPercent: 'asc' },
    });
    const match = entries.find((entry) => percent >= entry.minPercent && percent < entry.maxPercent)
      // A percent at or above every configured bracket's maxPercent falls
      // into the highest bracket by design (e.g. a 25% discount with
      // brackets 0-5/5-10/>10 should still require whatever role is
      // configured for the ">10" bracket, not "no approval needed").
      ?? entries.reduce<(typeof entries)[number] | null>((highest, entry) => {
        if (percent < entry.minPercent) return highest;
        if (!highest || entry.minPercent > highest.minPercent) return entry;
        return highest;
      }, null);
    return match?.requiredRole ?? null;
  }
}
