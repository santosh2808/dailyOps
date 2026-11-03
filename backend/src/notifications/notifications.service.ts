import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailerLink, MailerService } from '../mailer/mailer.service';
import { frontendBaseUrl } from '../common/frontend-base-url';

// In-app notifications — the Topbar bell (see the Notification model).
//
// Writers (LeadsService, QuotationsService) call notifyUsers() /
// notifyPermissionHolders() after the action itself has succeeded. Both
// never throw: a notification is a courtesy, so a failure here is logged
// and the reassignment/approval/assignment that triggered it still stands.
// Readers are only ever the recipient themselves (NotificationsController
// always scopes by the logged-in user's id).
//
// Some notifications also go out as an email to the same recipients (pass
// `email`). Those are sent in the background, one per recipient with an
// email address, through MailerService (EmailHistory, editable templates).

export type NotificationType =
  | 'LEAD_REASSIGNMENT_REQUESTED'
  | 'LEAD_REASSIGNMENT_APPROVED'
  | 'LEAD_REASSIGNMENT_REJECTED'
  | 'LEAD_ASSIGNED'
  | 'QUOTATION_APPROVAL_REQUESTED'
  | 'QUOTATION_APPROVAL_APPROVED'
  | 'QUOTATION_APPROVAL_REJECTED'
  | 'QUOTATION_ACCEPTED_BY_CUSTOMER'
  | 'QUOTATION_REJECTED_BY_CUSTOMER'
  | 'NEW_UNASSIGNED_LEAD';

export interface NotificationInput {
  type: NotificationType;
  title: string;
  body?: string | null;
  // In-app path the bell opens, e.g. /leads/reassignments.
  link?: string | null;
}

export interface NotificationEmail {
  // EmailTemplate key (editable under Email Templates); the fallback is used
  // when no active template row exists for it.
  templateKey: string;
  fallbackSubject: string;
  fallbackBodyHtml: string;
  // HTML-escaped here before rendering. {{recipientName}} and {{link}} (the
  // notification's link as a full URL) are added for each email.
  vars: Record<string, string>;
  mailerLink: MailerLink;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// The bell's list is a recent-activity view, not an archive.
const LIST_LIMIT_DEFAULT = 20;
const LIST_LIMIT_MAX = 50;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private mailerService: MailerService,
  ) {}

  // One notification per distinct, active recipient (plus the email, if
  // given). `excludeUserId` is the person who caused it — nobody is
  // notified about their own action.
  async notifyUsers(
    userIds: Array<string | null | undefined>,
    input: NotificationInput,
    excludeUserId?: string | null,
    email?: NotificationEmail,
  ): Promise<void> {
    let recipients: { id: string; name: string; email: string | null }[];
    try {
      const ids = [...new Set(userIds.filter((id): id is string => !!id && id !== excludeUserId))];
      if (ids.length === 0) return;
      // Deactivated users can't log in to act on them, so skip them.
      recipients = await this.prisma.user.findMany({
        where: { id: { in: ids }, isActive: true },
        select: { id: true, name: true, email: true },
      });
      if (recipients.length === 0) return;
    } catch (error) {
      this.logger.error(`${input.type} recipients lookup failed: ${(error as Error)?.message ?? 'unknown error'}`);
      return;
    }

    try {
      await this.prisma.notification.createMany({
        data: recipients.map(({ id }) => ({
          userId: id,
          type: input.type,
          title: input.title,
          body: input.body ?? null,
          link: input.link ?? null,
        })),
      });
    } catch (error) {
      this.logger.error(`${input.type} notification failed: ${(error as Error)?.message ?? 'unknown error'}`);
    }

    // Not awaited: SMTP can take seconds per message, and the action that
    // triggered this has already succeeded.
    if (email) void this.sendEmails(recipients, input, email);
  }

  private async sendEmails(
    recipients: { name: string; email: string | null }[],
    input: NotificationInput,
    email: NotificationEmail,
  ): Promise<void> {
    const vars = Object.fromEntries(Object.entries(email.vars).map(([k, v]) => [k, escapeHtml(v)]));
    const link = escapeHtml(input.link ? `${frontendBaseUrl()}${input.link}` : frontendBaseUrl());
    for (const recipient of recipients) {
      if (!recipient.email) continue;
      try {
        await this.mailerService.send({
          templateKey: email.templateKey,
          fallbackSubject: email.fallbackSubject,
          fallbackBodyHtml: email.fallbackBodyHtml,
          vars: { ...vars, recipientName: escapeHtml(recipient.name), link },
          to: recipient.email,
          link: email.mailerLink,
        });
      } catch (error) {
        this.logger.error(`${input.type} email failed: ${(error as Error)?.message ?? 'unknown error'}`);
      }
    }
  }

  // Everyone whose roles grant module.action — the same permission that
  // gates the page the notification links to, so recipients are exactly
  // the people who can act on it (e.g. Lead.Approve → Lead Reassignments).
  async notifyPermissionHolders(
    module: string,
    action: string,
    input: NotificationInput,
    excludeUserId?: string | null,
    email?: NotificationEmail,
  ): Promise<void> {
    let userIds: string[];
    try {
      const holders = await this.prisma.user.findMany({
        where: {
          isActive: true,
          roles: { some: { role: { permissions: { some: { permission: { module, action } } } } } },
        },
        select: { id: true },
      });
      userIds = holders.map((u) => u.id);
    } catch (error) {
      this.logger.error(`${input.type} recipients lookup failed: ${(error as Error)?.message ?? 'unknown error'}`);
      return;
    }
    await this.notifyUsers(userIds, input, excludeUserId, email);
  }

  async list(userId: string, limit = LIST_LIMIT_DEFAULT) {
    const take = Math.min(Math.max(Math.trunc(limit) || LIST_LIMIT_DEFAULT, 1), LIST_LIMIT_MAX);
    const [items, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take,
        select: { id: true, type: true, title: true, body: true, link: true, readAt: true, createdAt: true },
      }),
      this.unreadCount(userId),
    ]);
    return { items, unreadCount };
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  // What the bell and the sidebar badges poll: the unread count, plus how
  // many requests are waiting for a decision on the approval pages this
  // user can open (only the ones their permissions allow — `permissions`
  // are JwtStrategy's lower-case "module.action" codes).
  async summary(userId: string, permissions: string[]) {
    const [unreadCount, leadReassignments, quotationApprovals] = await Promise.all([
      this.unreadCount(userId),
      permissions.includes('lead.approve')
        ? this.prisma.leadReassignmentRequest.count({ where: { status: 'PENDING' } })
        : Promise.resolve(undefined),
      permissions.includes('quotation.approve')
        ? this.prisma.quotationApprovalRequest.count({ where: { status: 'PENDING' } })
        : Promise.resolve(undefined),
    ]);
    return { unreadCount, pending: { leadReassignments, quotationApprovals } };
  }

  // Scoped to the owner: someone else's notification id just matches
  // nothing, the same as an unknown id.
  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { unreadCount: await this.unreadCount(userId) };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { unreadCount: 0 };
  }
}
