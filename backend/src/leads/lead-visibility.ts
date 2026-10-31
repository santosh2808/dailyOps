import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Lead visibility ("only assigned leads are visible to that person").
//
// Roles that see EVERY lead, assigned or not. Everyone else (Sales Executive,
// and any other role) only ever sees leads where Lead.assignedToUserId is
// their own user id. Unassigned leads are therefore visible to the roles below
// only. Secure by default: a role that is not listed is restricted.
//
// Matching ignores case, spaces, hyphens and underscores. Roles are created
// dynamically from the Users screen, so no role other than
// Administrator/Sales Manager is guaranteed to exist by the seed — create a
// role named like one of these (e.g. "Telecaller", "Digital Marketing") and it
// is covered automatically.
const FULL_VISIBILITY_NORMALISED = new Set([
  'administrator',
  'salesmanager',
  'telecaller',
  'telecallers',
  'digitalmarketing',
  'digitalmarketer',
]);

function normaliseRole(name: string): string {
  return name.toLowerCase().replace(/[\s_-]+/g, '');
}

export interface LeadViewer {
  id?: string;
  role?: string | null;
  roles?: string[];
}

// `viewer` undefined = an internal caller (cron, public form intake, other
// services acting on the system's behalf) — never restricted. Every HTTP
// controller entry point passes req.user.
export function canViewAllLeads(viewer?: LeadViewer | null): boolean {
  if (!viewer) return true;
  const roles = viewer.roles ?? [];
  // Legacy User.role column. It DEFAULTS to 'admin' for every user (see
  // schema.prisma), so it says nothing about who is really an admin — a Sales
  // Executive created from the Users screen carries it too. It is therefore
  // only a fallback for a user with NO RBAC roles at all (e.g. a legacy
  // seeded account); any user with an assigned role is judged by that role.
  if (roles.length === 0) return !!viewer.role && viewer.role.toLowerCase() === 'admin';
  return roles.some((r) => FULL_VISIBILITY_NORMALISED.has(normaliseRole(r)));
}

// A Sales Executive's new lead is always their own (Create Lead): they can
// only see leads assigned to them, so assigning one elsewhere at creation
// made it vanish from the creator straight away. Full-visibility roles win
// for a user holding both, keeping their normal free choice. Reassigning
// later still goes through the existing approval flow (update()).
const SELF_ASSIGN_ON_CREATE_NORMALISED = new Set(['salesexecutive', 'salesexecutives']);

export function mustSelfAssignNewLeads(viewer?: LeadViewer | null): boolean {
  if (!viewer?.id || canViewAllLeads(viewer)) return false;
  return (viewer.roles ?? []).some((r) => SELF_ASSIGN_ON_CREATE_NORMALISED.has(normaliseRole(r)));
}

export function leadVisibilityWhere(viewer?: LeadViewer | null): Prisma.LeadWhereInput {
  if (canViewAllLeads(viewer)) return {};
  // A restricted user with no id can match nothing.
  return { assignedToUserId: viewer?.id ?? '__none__' };
}

// A quotation is visible if it traces back to a lead the viewer can see, or
// has no lead at all (a manual, customer-based quotation — nothing about a
// lead to protect).
export function quotationVisibilityWhere(viewer?: LeadViewer | null): Prisma.QuotationWhereInput {
  if (canViewAllLeads(viewer)) return {};
  return { OR: [{ leadId: null }, { lead: leadVisibilityWhere(viewer) }] };
}

export function salesOrderVisibilityWhere(viewer?: LeadViewer | null): Prisma.SalesOrderWhereInput {
  if (canViewAllLeads(viewer)) return {};
  return { quotation: quotationVisibilityWhere(viewer) };
}

// Row-level guards for controllers whose routes take an `:id` param. Run after
// JwtAuthGuard (so req.user exists). A hidden record answers 404 exactly like
// a missing one, so ids can't be probed. Routes without an `:id` (list,
// export, import, …) are scoped inside their service instead.
abstract class VisibilityGuard implements CanActivate {
  protected abstract notFoundMessage: string;
  protected abstract isVisible(id: string, viewer: LeadViewer): Promise<boolean>;

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const viewer: LeadViewer | undefined = req.user;
    const id: string | undefined = req.params?.id;
    if (!id || canViewAllLeads(viewer)) return true;
    if (!(await this.isVisible(id, viewer as LeadViewer))) {
      throw new NotFoundException(this.notFoundMessage);
    }
    return true;
  }
}

@Injectable()
export class LeadVisibilityGuard extends VisibilityGuard {
  protected notFoundMessage = 'Lead not found';
  constructor(private prisma: PrismaService) {
    super();
  }
  protected async isVisible(id: string, viewer: LeadViewer) {
    return (await this.prisma.lead.count({ where: { id, ...leadVisibilityWhere(viewer) } })) > 0;
  }
}

@Injectable()
export class QuotationVisibilityGuard extends VisibilityGuard {
  protected notFoundMessage = 'Quotation not found';
  constructor(private prisma: PrismaService) {
    super();
  }
  protected async isVisible(id: string, viewer: LeadViewer) {
    return (await this.prisma.quotation.count({ where: { id, ...quotationVisibilityWhere(viewer) } })) > 0;
  }
}

@Injectable()
export class SalesOrderVisibilityGuard extends VisibilityGuard {
  protected notFoundMessage = 'Sales order not found';
  constructor(private prisma: PrismaService) {
    super();
  }
  protected async isVisible(id: string, viewer: LeadViewer) {
    return (await this.prisma.salesOrder.count({ where: { id, ...salesOrderVisibilityWhere(viewer) } })) > 0;
  }
}
