import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { frontendBaseUrl } from '../common/frontend-base-url';
import { allApproverEmails } from '../sales-orders/dispatch-override-approvers';

// Override Approval workflow — replaces the old self-declare "Approved By"
// dropdown on all three below-threshold override gates (SalesOrder dispatch,
// ProformaInvoice advance, JEO production-start). See
// OverrideApprovalRequest's schema.prisma comment for the full rationale:
// Santosh/Amarpal have no real User account in this system, so this is a
// real, blocking, no-login email-link approval — mirroring
// QuotationsService's customer-acceptance public-link pattern — rather than
// an in-app role-based approval (there is no login for these two people to
// use).

// NOTE: this module is written against `prisma.overrideApprovalRequest` /
// the `OverrideApprovalType`/`OverrideApprovalStatus` enums exactly as
// declared in schema.prisma. It was authored in a sandbox where `prisma
// generate` cannot reach the network to fetch its engine binary (see this
// repo's standing "Sandbox limitation" note), so @prisma/client's generated
// types on disk right now don't yet include this new model — `npx prisma
// generate` (network access to binaries.prisma.sh) must be run to
// regenerate the client from the updated schema.prisma before this compiles,
// same as every prior schema-migrating change in this project's history.
// Plain string-literal unions are declared below (rather than importing the
// Prisma-generated enum types) purely so this file's own exported types
// don't depend on that regeneration having happened yet.
export type OverrideApprovalType = 'SALES_ORDER_DISPATCH' | 'PROFORMA_INVOICE_ADVANCE' | 'JEO_PRODUCTION_START';
export type OverrideApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'FAILED';

export interface CreateOverrideApprovalRequestParams {
  type: OverrideApprovalType;
  salesOrderId: string;
  proformaInvoiceId?: string;
  // What to actually do once approved — shape is type-specific; read back
  // by ApprovalDecisionsService's apply*() call into the owning service.
  actionPayload: Record<string, unknown>;
  advanceReceived: number;
  requiredAdvance: number;
  requestedByName?: string;
  requestedByEmail?: string;
  // Human-readable description of what's being asked for, shown on the
  // public approval page and in the "Approval Requested" email — e.g. "mark
  // Sales Order SR-... as Ready for Dispatch" — since actionPayload itself
  // isn't fit to render directly.
  actionSummary: string;
}

function humanLabel(type: OverrideApprovalType): string {
  switch (type) {
    case 'SALES_ORDER_DISPATCH':
      return 'dispatch override';
    case 'PROFORMA_INVOICE_ADVANCE':
      return 'advance payment override';
    case 'JEO_PRODUCTION_START':
      return 'production-start override';
  }
}

const APPROVAL_LINK_EXPIRY_DAYS_DEFAULT = 14;

function approvalLinkExpiryDays(): number {
  const parsed = Number(process.env.APPROVAL_LINK_EXPIRY_DAYS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : APPROVAL_LINK_EXPIRY_DAYS_DEFAULT;
}

@Injectable()
export class ApprovalRequestsService {
  private readonly logger = new Logger(ApprovalRequestsService.name);

  constructor(
    private prisma: PrismaService,
    private mailerService: MailerService,
  ) {}

  // Called from inside the three existing gate-check blocks (SalesOrders
  // .updateStatus(), ProformaInvoices.updateAdvance(), JobExecutionOrders
  // .create()) the moment advance-received falls below the required
  // threshold — in place of the old inline self-declare-and-proceed check.
  // Never performs the original action itself; the caller is expected to
  // throw immediately after this returns, telling the user the action is
  // now waiting on a real approval. Idempotent: if a PENDING request of the
  // same type against the same Sales Order (or, for advance overrides, the
  // same Proforma Invoice) already exists, that one is returned as-is and
  // no duplicate email goes out — repeatedly clicking the same blocked
  // button doesn't spam Santosh/Amar with a fresh email every time.
  async createRequest(params: CreateOverrideApprovalRequestParams) {
    const existing = await this.prisma.overrideApprovalRequest.findFirst({
      where: {
        type: params.type,
        salesOrderId: params.salesOrderId,
        ...(params.proformaInvoiceId ? { proformaInvoiceId: params.proformaInvoiceId } : {}),
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      return existing;
    }

    const publicToken = crypto.randomBytes(32).toString('base64url');
    const tokenExpiresAt = new Date(Date.now() + approvalLinkExpiryDays() * 24 * 60 * 60 * 1000);

    const created = await this.prisma.overrideApprovalRequest.create({
      data: {
        type: params.type,
        salesOrderId: params.salesOrderId,
        proformaInvoiceId: params.proformaInvoiceId,
        actionPayload: params.actionPayload,
        advanceReceived: params.advanceReceived,
        requiredAdvance: params.requiredAdvance,
        requestedByName: params.requestedByName,
        requestedByEmail: params.requestedByEmail,
        status: 'PENDING',
        publicToken,
        tokenExpiresAt,
      },
    });

    await this.notifyApprovers(created, params.actionSummary).catch((error) =>
      this.logger.error('Approval Requested notification failed', error),
    );

    return created;
  }

  // Emails BOTH named approvers at once (either one deciding is enough —
  // same "either of the two" convention as the old DISPATCH_OVERRIDE_APPROVERS
  // allow-list). An approver with no email on file (APPROVER_SANTOSH_EMAIL /
  // APPROVER_AMAR_EMAIL unset — see dispatch-override-approvers.ts) is
  // silently skipped here, not treated as a failure: MailerService.send()
  // itself never throws, and a request with zero deliverable emails still
  // sits there as a real PENDING row an Administrator can see reflected by
  // the blocked action — it just won't have reached anyone yet until an env
  // var is set.
  private async notifyApprovers(request: { id: string; publicToken: string; type: OverrideApprovalType }, actionSummary: string) {
    const approvers = allApproverEmails();
    if (approvers.length === 0) {
      this.logger.warn(
        'No approver email configured (APPROVER_SANTOSH_EMAIL / APPROVER_AMAR_EMAIL) — Approval Requested email not sent for request ' +
          request.id,
      );
      return;
    }
    const approvalLink = `${frontendBaseUrl()}/approvals/${request.publicToken}`;
    const expiryDays = String(approvalLinkExpiryDays());
    await Promise.all(
      approvers.map((approver) =>
        this.mailerService.send({
          templateKey: 'OVERRIDE_APPROVAL_REQUESTED',
          fallbackSubject: `Approval needed: ${humanLabel(request.type)}`,
          fallbackBodyHtml:
            '<p>Dear {{approverName}},</p><p>{{actionSummary}} is awaiting your approval — advance payment received is below the required minimum.</p><p><a href="{{approvalLink}}">Review and decide</a></p><p>This link expires in {{expiryDays}} days.</p>',
          // {{}} placeholders here MUST match whatever the admin's active
          // OVERRIDE_APPROVAL_REQUESTED EmailTemplate row (seeded in
          // seed.ts) references, same convention as every mailerService
          // .send() call in this codebase — see ApprovalDecisionsService
          // .notifyRequester()'s own comment.
          vars: { approverName: approver.name, actionSummary, approvalLink, expiryDays },
          to: approver.email,
          link: { module: 'OverrideApproval', approvalRequestId: request.id },
        }),
      ),
    );
  }

  // Public-endpoint lookup — same anti-enumeration convention as
  // QuotationsService.findByPublicToken(): an unknown/malformed token gets
  // exactly the same NotFoundException as any other invalid one.
  async findByPublicToken(token: string) {
    const request = await this.prisma.overrideApprovalRequest.findUnique({
      where: { publicToken: token },
      include: {
        salesOrder: { include: { customer: true } },
        proformaInvoice: true,
      },
    });
    if (!request) {
      throw new NotFoundException('This approval link is invalid.');
    }
    return request;
  }

  // Auto-expires a still-PENDING request whose link has passed its own
  // expiry — same pattern as QuotationsService.autoExpireIfNeeded(), called
  // by ApprovalDecisionsService right after resolving the token, before any
  // decision is allowed.
  async autoExpireIfNeeded(request: { id: string; status: OverrideApprovalStatus; tokenExpiresAt: Date }) {
    if (request.status === 'PENDING' && request.tokenExpiresAt.getTime() < Date.now()) {
      return this.prisma.overrideApprovalRequest.update({
        where: { id: request.id },
        data: { status: 'EXPIRED' },
        include: { salesOrder: { include: { customer: true } }, proformaInvoice: true },
      });
    }
    return request;
  }

  async markApproved(id: string, decidedApprover: string, decisionNote: string | null) {
    return this.prisma.overrideApprovalRequest.update({
      where: { id },
      data: { status: 'APPROVED', decidedApprover, decidedAt: new Date(), decisionNote },
    });
  }

  async markRejected(id: string, decidedApprover: string, decisionNote: string | null) {
    return this.prisma.overrideApprovalRequest.update({
      where: { id },
      data: { status: 'REJECTED', decidedApprover, decidedAt: new Date(), decisionNote },
    });
  }

  // The approver said yes, but actually replaying the original action
  // failed (e.g. the Sales Order was cancelled or deleted in the meantime).
  // The decision itself (who approved it, when) is left untouched — only
  // resultError/status change — so there's still an honest record that a
  // real approval happened, distinct from it having taken effect.
  async markFailed(id: string, resultError: string) {
    return this.prisma.overrideApprovalRequest.update({
      where: { id },
      data: { status: 'FAILED', resultError },
    });
  }
}
