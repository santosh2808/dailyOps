import { Logger } from '@nestjs/common';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { LeadsService } from '../../src/leads/leads.service';
import { QuotationsService } from '../../src/quotations/quotations.service';
import { PublicFormsService } from '../../src/public-forms/public-forms.service';

const input = { type: 'LEAD_ASSIGNED' as const, title: 'Lead L-1 assigned to you', link: '/leads/l1' };

function makePrisma(activeIds: string[] = ['u1', 'u2']) {
  return {
    user: {
      findMany: jest.fn().mockResolvedValue(activeIds.map((id) => ({ id, name: `Name ${id}`, email: `${id}@example.com` }))),
    },
    notification: {
      createMany: jest.fn().mockResolvedValue({ count: activeIds.length }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(3),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    leadReassignmentRequest: { count: jest.fn().mockResolvedValue(2) },
    quotationApprovalRequest: { count: jest.fn().mockResolvedValue(4) },
  };
}

describe('NotificationsService', () => {
  let mailer: { send: jest.Mock };
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    mailer = { send: jest.fn().mockResolvedValue({ status: 'SENT' }) };
  });
  afterEach(() => jest.restoreAllMocks());
  // Emails are sent in the background; let them run.
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  it('writes one row per distinct active recipient, skipping the actor and blanks', async () => {
    const prisma = makePrisma(['u1']);
    await new NotificationsService(prisma as any, mailer as any).notifyUsers(['u1', 'u1', null, undefined, 'actor', 'gone'], input, 'actor');
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['u1', 'gone'] }, isActive: true },
      select: { id: true, name: true, email: true },
    });
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'u1', type: 'LEAD_ASSIGNED', title: 'Lead L-1 assigned to you', body: null, link: '/leads/l1' }],
    });
  });

  it('writes nothing when the only recipient is the actor', async () => {
    const prisma = makePrisma();
    await new NotificationsService(prisma as any, mailer as any).notifyUsers(['me'], input, 'me');
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('never throws — a failed write is only logged', async () => {
    const prisma = makePrisma();
    prisma.notification.createMany.mockRejectedValue(new Error('db down'));
    await expect(new NotificationsService(prisma as any, mailer as any).notifyUsers(['u1'], input)).resolves.toBeUndefined();
    prisma.user.findMany.mockRejectedValue(new Error('db down'));
    await expect(
      new NotificationsService(prisma as any, mailer as any).notifyPermissionHolders('Lead', 'Approve', input),
    ).resolves.toBeUndefined();
  });

  it('finds recipients by permission, among active users only', async () => {
    const prisma = makePrisma(['u1', 'u2']);
    await new NotificationsService(prisma as any, mailer as any).notifyPermissionHolders('Lead', 'Approve', input, 'u2');
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
      isActive: true,
      roles: { some: { role: { permissions: { some: { permission: { module: 'Lead', action: 'Approve' } } } } } },
    });
    // The second lookup is notifyUsers() re-checking the remaining ids.
    expect(prisma.user.findMany.mock.calls[1][0].where.id).toEqual({ in: ['u1'] });
  });

  it('summary counts pending approvals only for pages the user can open', async () => {
    const prisma = makePrisma();
    const svc = new NotificationsService(prisma as any, mailer as any);
    await expect(svc.summary('u1', ['lead.view'])).resolves.toEqual({
      unreadCount: 3,
      pending: { leadReassignments: undefined, quotationApprovals: undefined },
    });
    expect(prisma.leadReassignmentRequest.count).not.toHaveBeenCalled();
    await expect(svc.summary('u1', ['lead.approve', 'quotation.approve'])).resolves.toEqual({
      unreadCount: 3,
      pending: { leadReassignments: 2, quotationApprovals: 4 },
    });
    expect(prisma.leadReassignmentRequest.count).toHaveBeenCalledWith({ where: { status: 'PENDING' } });
  });

  const email = {
    templateKey: 'LEAD_REASSIGNMENT_REQUESTED',
    fallbackSubject: 'Subject {{leadNumber}}',
    fallbackBodyHtml: '<p>{{requestedBy}}</p>',
    vars: { leadNumber: 'L-1', requestedBy: 'Esha <b>Exec</b> & co' },
    mailerLink: { module: 'Lead', leadId: 'l1' },
  };

  it('with an email, sends one per recipient with an address, values HTML-escaped', async () => {
    const prisma = makePrisma(['u1', 'u2']);
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', name: 'Asha', email: 'asha@example.com' },
      { id: 'u2', name: 'No Mail', email: null },
    ]);
    await new NotificationsService(prisma as any, mailer as any).notifyUsers(['u1', 'u2'], input, null, email);
    await flush();
    expect(prisma.notification.createMany.mock.calls[0][0].data).toHaveLength(2);
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(mailer.send).toHaveBeenCalledWith({
      templateKey: 'LEAD_REASSIGNMENT_REQUESTED',
      fallbackSubject: 'Subject {{leadNumber}}',
      fallbackBodyHtml: '<p>{{requestedBy}}</p>',
      vars: {
        leadNumber: 'L-1',
        requestedBy: 'Esha &lt;b&gt;Exec&lt;/b&gt; &amp; co',
        recipientName: 'Asha',
        link: expect.stringMatching(/\/leads\/l1$/),
      },
      to: 'asha@example.com',
      link: { module: 'Lead', leadId: 'l1' },
    });
  });

  it('without an email, sends none', async () => {
    const prisma = makePrisma(['u1']);
    await new NotificationsService(prisma as any, mailer as any).notifyUsers(['u1'], input);
    await flush();
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('the email still goes if saving the in-app notification fails, and a mail failure is only logged', async () => {
    const prisma = makePrisma(['u1', 'u2']);
    prisma.notification.createMany.mockRejectedValue(new Error('db down'));
    mailer.send.mockRejectedValueOnce(new Error('smtp down'));
    await expect(
      new NotificationsService(prisma as any, mailer as any).notifyUsers(['u1', 'u2'], input, null, email),
    ).resolves.toBeUndefined();
    await flush();
    // The first send failed; the second recipient still got theirs.
    expect(mailer.send).toHaveBeenCalledTimes(2);
  });

  it('permission holders get the email too', async () => {
    const prisma = makePrisma(['u1']);
    await new NotificationsService(prisma as any, mailer as any).notifyPermissionHolders('Lead', 'Approve', input, null, email);
    await flush();
    expect(mailer.send.mock.calls[0][0].to).toBe('u1@example.com');
  });

  it('reads and clears only the owner’s notifications', async () => {
    const prisma = makePrisma();
    const svc = new NotificationsService(prisma as any, mailer as any);
    await svc.list('u1', 500);
    expect(prisma.notification.findMany.mock.calls[0][0]).toMatchObject({ where: { userId: 'u1' }, take: 50 });
    await svc.markRead('u1', 'n1');
    expect(prisma.notification.updateMany.mock.calls[0][0].where).toEqual({ id: 'n1', userId: 'u1', readAt: null });
    await svc.markAllRead('u1');
    expect(prisma.notification.updateMany.mock.calls[1][0].where).toEqual({ userId: 'u1', readAt: null });
  });
});

describe('Lead assigned notification', () => {
  function make() {
    const notifications = { notifyUsers: jest.fn() };
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue(null) } };
    const svc: any = new LeadsService(prisma, {} as any, {} as any, {} as any, notifications as any);
    return { svc, notifications };
  }
  const lead = { id: 'l1', leadNumber: 'L-1', title: 't', companyName: 'Acme', contactPerson: 'Ravi', phone: '9876543210' };

  it('notifies the new owner, linking to the lead', async () => {
    const { svc, notifications } = make();
    await svc.notifyLeadAssigned('u-owner', lead, 'u-boss');
    expect(notifications.notifyUsers).toHaveBeenCalledWith(
      ['u-owner'],
      { type: 'LEAD_ASSIGNED', title: 'Lead L-1 assigned to you', body: 'Acme · Ravi', link: '/leads/l1' },
      'u-boss',
    );
  });
});

describe('Quotation approval notifications', () => {
  const approver = { id: 'u-admin', name: 'Asha Admin', roles: ['Administrator'] };

  function make(request: Record<string, unknown> = {}) {
    const notifications = { notifyUsers: jest.fn(), notifyPermissionHolders: jest.fn() };
    const prisma: any = {
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
      $queryRaw: jest.fn().mockResolvedValue([]),
      quotation: {
        findUnique: jest.fn().mockResolvedValue({ id: 'q1', status: 'SENT', discount: 0, items: [] }),
        update: jest.fn().mockResolvedValue({ id: 'q1', status: 'ACCEPTED' }),
      },
      quotationApprovalRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'r1' }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'r1',
          quotationId: 'q1',
          status: 'PENDING',
          purpose: 'ACCEPT',
          pricingKey: '|discount:0',
          requestedByUserId: 'u-exec',
          quotation: { quotationNumber: 'Q-7' },
          ...request,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const svc: any = new QuotationsService(
      prisma, {} as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, audit as any, {} as any, {} as any, notifications as any,
    );
    return { svc, prisma, notifications };
  }

  it('a request records who asked and notifies everyone who can approve, except them', async () => {
    const { svc, prisma, notifications } = make();
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 'q1', quotationNumber: 'Q-7', items: [] });
    jest.spyOn(svc, 'computeDiscountPercent').mockReturnValue(12);
    await svc.requestApproval('q1', { reason: 'Bulk order' }, { id: 'u-exec', name: 'Esha Exec' });
    expect(prisma.quotationApprovalRequest.create.mock.calls[0][0].data.requestedByUserId).toBe('u-exec');
    expect(notifications.notifyPermissionHolders).toHaveBeenCalledWith(
      'Quotation',
      'Approve',
      {
        type: 'QUOTATION_APPROVAL_REQUESTED',
        title: 'Approval requested for Q-7',
        body: 'Esha Exec asked for approval: Bulk order',
        link: '/quotations/approvals',
      },
      'u-exec',
      expect.objectContaining({
        templateKey: 'QUOTATION_APPROVAL_REQUESTED',
        vars: { quotationNumber: 'Q-7', requestedBy: 'Esha Exec', customerCompany: 'customer not set', reason: 'Bulk order' },
        mailerLink: { module: 'Quotation', quotationId: 'q1' },
      }),
    );
  });

  it('a rejection notifies the requester', async () => {
    const { svc, notifications } = make();
    await svc.decideApprovalRequest('r1', { approve: false, remarks: 'Too low' }, approver);
    expect(notifications.notifyUsers).toHaveBeenCalledWith(
      ['u-exec'],
      {
        type: 'QUOTATION_APPROVAL_REJECTED',
        title: 'Approval for Q-7 rejected',
        body: 'Decided by Asha Admin: Too low',
        link: '/quotations/q1',
      },
      'u-admin',
      expect.objectContaining({
        templateKey: 'QUOTATION_APPROVAL_DECIDED',
        vars: { quotationNumber: 'Q-7', decision: 'rejected', decidedBy: 'Asha Admin', decisionNote: 'Remarks: Too low' },
      }),
    );
  });

  it('an approval notifies the requester only after the quotation is accepted', async () => {
    const { svc, prisma, notifications } = make();
    await svc.decideApprovalRequest('r1', { approve: true }, approver);
    expect(prisma.quotation.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'ACCEPTED' } }));
    expect(notifications.notifyUsers.mock.calls[0][1]).toMatchObject({
      type: 'QUOTATION_APPROVAL_APPROVED',
      title: 'Approval for Q-7 granted',
    });

    notifications.notifyUsers.mockClear();
    prisma.quotation.update.mockRejectedValue(new Error('accept failed'));
    await expect(svc.decideApprovalRequest('r1', { approve: true }, approver)).rejects.toThrow('accept failed');
    expect(notifications.notifyUsers).not.toHaveBeenCalled();
  });
});

describe('Customer decision on the public quotation link', () => {
  function make(users: { findUnique?: unknown; findFirst?: unknown }) {
    const notifications = { notifyUsers: jest.fn() };
    const mailer = { send: jest.fn().mockResolvedValue({ status: 'SENT' }) };
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue(users.findUnique ?? null),
        findFirst: jest.fn().mockResolvedValue(users.findFirst ?? null),
      },
    };
    const svc: any = new QuotationsService(
      prisma, {} as any, {} as any, {} as any, {} as any,
      mailer as any, {} as any, {} as any, {} as any, {} as any, notifications as any,
    );
    return { svc, notifications, mailer };
  }
  const quotation = (over: Record<string, unknown> = {}) => ({
    id: 'q1',
    quotationNumber: 'Q-7',
    sentBy: 'Sam Sender',
    acceptedByName: 'Ravi',
    rejectionReason: 'Too costly',
    customer: { companyName: 'Acme' },
    lead: { assignedToUserId: 'u-owner', companyName: 'Acme' },
    ...over,
  });

  it('acceptance notifies the lead owner, alongside the existing email', async () => {
    const { svc, notifications, mailer } = make({ findUnique: { id: 'u-owner', email: 'owner@example.com' } });
    await svc.notifyInternalOfDecision(quotation(), 'ACCEPTED');
    expect(notifications.notifyUsers).toHaveBeenCalledWith(['u-owner'], {
      type: 'QUOTATION_ACCEPTED_BY_CUSTOMER',
      title: 'Customer accepted Q-7',
      body: 'Acme accepted it (Ravi).',
      link: '/quotations/q1',
    });
    expect(mailer.send.mock.calls[0][0].to).toBe('owner@example.com');
  });

  it('rejection falls back to whoever sent the quotation when there is no lead owner', async () => {
    const { svc, notifications, mailer } = make({ findFirst: { id: 'u-sender', email: 'sender@example.com' } });
    await svc.notifyInternalOfDecision(quotation({ lead: null }), 'REJECTED');
    expect(notifications.notifyUsers).toHaveBeenCalledWith(
      ['u-sender'],
      expect.objectContaining({ type: 'QUOTATION_REJECTED_BY_CUSTOMER', body: 'Acme rejected it: Too costly' }),
    );
    expect(mailer.send.mock.calls[0][0].to).toBe('sender@example.com');
  });

  it('an owner without an email still gets the in-app notification; the email goes to the sender', async () => {
    const { svc, notifications, mailer } = make({
      findUnique: { id: 'u-owner', email: null },
      findFirst: { id: 'u-sender', email: 'sender@example.com' },
    });
    await svc.notifyInternalOfDecision(quotation(), 'ACCEPTED');
    expect(notifications.notifyUsers.mock.calls[0][0]).toEqual(['u-sender']);
    expect(mailer.send.mock.calls[0][0].to).toBe('sender@example.com');
  });
});

describe('Website form lead notification', () => {
  function make() {
    const notifications = { notifyUsers: jest.fn(), notifyPermissionHolders: jest.fn() };
    const svc: any = new PublicFormsService({} as any, {} as any, {} as any, {} as any, {} as any, notifications as any);
    return { svc, notifications };
  }
  const lead = { id: 'l9', leadNumber: 'LD-000031' };

  it('a lead routed to a salesperson notifies nobody (they get the email)', async () => {
    const { svc, notifications } = make();
    await svc.notifyWebLead(lead, { name: 'Ravi', company: 'Acme', subjectLabel: 'HVLS Fans', assignedUserId: 'u-sales' });
    expect(notifications.notifyUsers).not.toHaveBeenCalled();
    expect(notifications.notifyPermissionHolders).not.toHaveBeenCalled();
  });

  it('an unrouted lead notifies the people who assign leads', async () => {
    const { svc, notifications } = make();
    await svc.notifyWebLead(lead, { name: 'Ravi', subjectLabel: 'General enquiry', assignedUserId: null });
    expect(notifications.notifyPermissionHolders).toHaveBeenCalledWith('Lead', 'Approve', {
      type: 'NEW_UNASSIGNED_LEAD',
      title: 'New website lead LD-000031',
      body: 'Ravi — General enquiry. Unassigned.',
      link: '/leads/l9',
    });
    expect(notifications.notifyUsers).not.toHaveBeenCalled();
  });
});
