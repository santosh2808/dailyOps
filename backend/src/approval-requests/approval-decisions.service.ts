import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { ApprovalRequestsService, type OverrideApprovalStatus } from './approval-requests.service';
import { SalesOrdersService } from '../sales-orders/sales-orders.service';
import { ProformaInvoicesService } from '../proforma-invoices/proforma-invoices.service';
import { JobExecutionOrdersService } from '../job-execution-orders/job-execution-orders.service';
import { DecideOverrideApprovalDto } from './dto/decide-override-approval.dto';

// The public-facing approve/reject orchestrator for the Override Approval
// workflow — the counterpart to QuotationsService's accept/rejectViaPublicLink
// but for the SalesOrder-dispatch / ProformaInvoice-advance /
// JEO-production-start override gates instead of customer quotation
// acceptance. Deliberately its own module/service (rather than living in
// ApprovalRequestsModule) because this is the one place in the whole
// feature that needs to call back INTO all three gate-owning services
// (SalesOrders/ProformaInvoices/JobExecutionOrders) to actually replay the
// blocked action once approved — see ApprovalRequestsModule's own comment
// for why that would otherwise create a circular module dependency.
class SimpleRateLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  check(key: string): boolean {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}

@Injectable()
export class ApprovalDecisionsService {
  private readonly logger = new Logger(ApprovalDecisionsService.name);
  private readonly viewRateLimiter = new SimpleRateLimiter(30, 60_000);
  private readonly decisionRateLimiter = new SimpleRateLimiter(10, 60_000);

  constructor(
    private prisma: PrismaService,
    private mailerService: MailerService,
    private approvalRequestsService: ApprovalRequestsService,
    private salesOrdersService: SalesOrdersService,
    private proformaInvoicesService: ProformaInvoicesService,
    private jobExecutionOrdersService: JobExecutionOrdersService,
  ) {}

  // Human-readable description of what's being asked for — recomputed here
  // from the request's own linked records rather than stored as a column,
  // so it always reflects the current salesOrderNumber/invoiceNumber even
  // if those ever changed after the request was raised (they don't today,
  // but this avoids a second source of truth for display text).
  private describeAction(request: {
    type: string;
    actionPayload: unknown;
    salesOrder: { salesOrderNumber: string };
    proformaInvoice: { invoiceNumber: string } | null;
  }): string {
    switch (request.type) {
      case 'SALES_ORDER_DISPATCH': {
        const targetStatus = (request.actionPayload as { targetStatus?: string } | null)?.targetStatus ?? 'the next stage';
        return `Mark Sales Order ${request.salesOrder.salesOrderNumber} as ${targetStatus.replace(/_/g, ' ')}`;
      }
      case 'PROFORMA_INVOICE_ADVANCE': {
        const advanceReceived = (request.actionPayload as { advanceReceived?: number } | null)?.advanceReceived ?? 0;
        return `Record ₹${advanceReceived.toLocaleString('en-IN')} advance on Proforma Invoice ${request.proformaInvoice?.invoiceNumber ?? '—'}`;
      }
      case 'JEO_PRODUCTION_START':
        return `Start production (generate JEO) for Sales Order ${request.salesOrder.salesOrderNumber}`;
      default:
        return 'Approve this action';
    }
  }

  private clientKey(req: { ip?: string }): string {
    return req.ip || 'unknown';
  }

  // GET /api/v1/public/approvals/:token — sanitized view only (never the
  // raw actionPayload or any internal id), same "hand-picked fields"
  // convention as QuotationsService's PublicQuotationView.
  async getPublicView(token: string, clientKey: string) {
    if (!this.viewRateLimiter.check(`view:${clientKey}`)) {
      throw new BadRequestException('Too many requests. Please try again in a moment.');
    }
    let request = await this.approvalRequestsService.findByPublicToken(token);
    request = await this.approvalRequestsService.autoExpireIfNeeded(request);
    return {
      type: request.type,
      actionSummary: this.describeAction(request),
      advanceReceived: request.advanceReceived,
      requiredAdvance: request.requiredAdvance,
      requestedByName: request.requestedByName,
      requestedAt: request.requestedAt,
      status: request.status as OverrideApprovalStatus,
      tokenExpiresAt: request.tokenExpiresAt,
      decidedApprover: request.decidedApprover,
      decidedAt: request.decidedAt,
      decisionNote: request.decisionNote,
      resultError: request.resultError,
    };
  }

  // Only a still-open request (PENDING) can be decided — same
  // "assertDecidable" convention as QuotationsService, giving EXPIRED and
  // already-decided their own distinct messages rather than one generic
  // "not found".
  private assertDecidable(request: { status: string }): void {
    if (request.status === 'PENDING') return;
    if (request.status === 'EXPIRED') {
      throw new BadRequestException('This approval link has expired.');
    }
    if (request.status === 'APPROVED' || request.status === 'REJECTED' || request.status === 'FAILED') {
      throw new ConflictException(`This request has already been ${request.status.toLowerCase()}.`);
    }
    throw new ConflictException('This request is not currently available for review.');
  }

  async reject(token: string, dto: DecideOverrideApprovalDto, req: { ip?: string }) {
    const clientKey = this.clientKey(req);
    if (!this.decisionRateLimiter.check(`decide:${clientKey}`)) {
      throw new BadRequestException('Too many requests. Please try again in a moment.');
    }
    let request = await this.approvalRequestsService.findByPublicToken(token);
    request = await this.approvalRequestsService.autoExpireIfNeeded(request);
    this.assertDecidable(request);

    const rejectionNote = dto.note?.trim() || null;
    await this.approvalRequestsService.markRejected(request.id, dto.approverName, rejectionNote);
    await this.notifyRequester(request, 'REJECTED', dto.approverName, null, rejectionNote).catch((error) =>
      this.logger.error('Rejection notification failed', error),
    );

    return { status: 'REJECTED' as const, actionSummary: this.describeAction(request) };
  }

  // POST /api/v1/public/approvals/:token/approve — the actual "true
  // blocking gate release": marks the request APPROVED, then replays the
  // exact action that was originally blocked (dispatch status change /
  // advance recording / JEO generation) via the owning service's own
  // apply*() method — never by re-deriving the write here, so there is
  // exactly one place each of those three writes actually happens.
  async approve(token: string, dto: DecideOverrideApprovalDto, req: { ip?: string }) {
    const clientKey = this.clientKey(req);
    if (!this.decisionRateLimiter.check(`decide:${clientKey}`)) {
      throw new BadRequestException('Too many requests. Please try again in a moment.');
    }
    let request = await this.approvalRequestsService.findByPublicToken(token);
    request = await this.approvalRequestsService.autoExpireIfNeeded(request);
    this.assertDecidable(request);

    const actionSummary = this.describeAction(request);
    await this.approvalRequestsService.markApproved(request.id, dto.approverName, dto.note?.trim() || null);

    const decided = {
      salesOrderId: request.salesOrderId,
      proformaInvoiceId: request.proformaInvoiceId,
      actionPayload: request.actionPayload,
      decidedApprover: dto.approverName,
      requestedByName: request.requestedByName,
      decisionNote: dto.note?.trim() || null,
      decidedAt: new Date(),
    };

    try {
      switch (request.type) {
        case 'SALES_ORDER_DISPATCH':
          await this.salesOrdersService.applyApprovedDispatch(decided);
          break;
        case 'PROFORMA_INVOICE_ADVANCE':
          await this.proformaInvoicesService.applyApprovedAdvance(decided);
          break;
        case 'JEO_PRODUCTION_START':
          await this.jobExecutionOrdersService.applyApprovedProduction(decided);
          break;
        default:
          throw new BadRequestException(`Unknown approval type: ${request.type}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error applying the approved action';
      await this.approvalRequestsService.markFailed(request.id, message);
      await this.notifyRequester(request, 'FAILED', dto.approverName, message, dto.note?.trim() || null).catch((notifyError) =>
        this.logger.error('Failure notification failed', notifyError),
      );
      // Re-thrown so the approver sees this clearly on the public page too
      // — "you approved this, but applying it failed" — rather than a
      // silent success.
      throw new BadRequestException(
        `Approved, but applying the action failed: ${message}. Please contact the sales team directly.`,
      );
    }

    await this.notifyRequester(request, 'APPROVED', dto.approverName, null, dto.note?.trim() || null).catch((error) =>
      this.logger.error('Approval notification failed', error),
    );

    return { status: 'APPROVED' as const, actionSummary };
  }

  // Notifies whoever originally requested the override (if we have an
  // email for them — requestedByEmail is best-effort, see
  // ApprovalRequestsService.createRequest()'s comment) that a decision was
  // made. Never throws; same "never let a missing config value break a
  // business action" convention as MailerService itself.
  private async notifyRequester(
    request: {
      id: string;
      salesOrderId: string;
      requestedByEmail: string | null;
      salesOrder: { salesOrderNumber: string };
      type: string;
      actionPayload: unknown;
      proformaInvoice: { invoiceNumber: string } | null;
    },
    decision: 'APPROVED' | 'REJECTED' | 'FAILED',
    approverName: string,
    resultError: string | null,
    decisionNote: string | null,
  ) {
    if (!request.requestedByEmail) return;
    const actionSummary = this.describeAction(request);
    // {{}} vars below are what actually get substituted into whichever body
    // wins (DB template if an admin has activated/edited one via the Email
    // Templates screen, else the fallback) — every placeholder referenced by
    // either MUST appear here, same convention as every other
    // mailerService.send() call in this codebase (e.g.
    // ApprovalRequestsService.notifyApprovers() below).
    const vars = {
      salesOrderNumber: request.salesOrder.salesOrderNumber,
      approverName,
      actionSummary,
      decisionNote: decisionNote ?? '',
      resultError: resultError ?? '',
    };
    const subject =
      decision === 'APPROVED'
        ? `Approved: your request on Sales Order ${request.salesOrder.salesOrderNumber}`
        : decision === 'REJECTED'
          ? `Rejected: your request on Sales Order ${request.salesOrder.salesOrderNumber}`
          : `Approved but failed to apply: Sales Order ${request.salesOrder.salesOrderNumber}`;
    const body =
      decision === 'APPROVED'
        ? '<p>{{approverName}} approved your request:</p><p><b>{{actionSummary}}</b></p><p>It has been applied.</p>'
        : decision === 'REJECTED'
          ? '<p>{{approverName}} rejected your request:</p><p><b>{{actionSummary}}</b></p><p>{{decisionNote}}</p>'
          : '<p>{{approverName}} approved your request:</p><p><b>{{actionSummary}}</b></p><p>However, applying it failed: {{resultError}}. Please contact IT/Santosh directly.</p>';
    await this.mailerService.send({
      templateKey:
        decision === 'APPROVED'
          ? 'OVERRIDE_APPROVAL_APPROVED'
          : decision === 'REJECTED'
            ? 'OVERRIDE_APPROVAL_REJECTED'
            : 'OVERRIDE_APPROVAL_FAILED',
      fallbackSubject: subject,
      fallbackBodyHtml: body,
      vars,
      to: request.requestedByEmail,
      link: { module: 'OverrideApproval', salesOrderId: request.salesOrderId, approvalRequestId: request.id },
    });
  }
}
