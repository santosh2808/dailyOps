import { BadRequestException } from '@nestjs/common';
import { LeadsService } from '../../src/leads/leads.service';
import { LeadAccessService, SUSPICIOUS_THRESHOLDS } from '../../src/leads/lead-access.service';

const exec = { id: 'u-exec', name: 'Esha Exec', roles: ['Sales Executive'] };
const manager = { id: 'u-mgr', name: 'Manu Manager', roles: ['Sales Manager'] };

describe('LeadAccessService (audit log)', () => {
  function make(findFirst: any = null) {
    const create = jest.fn().mockResolvedValue({});
    const prisma: any = { auditLog: { create, findFirst: jest.fn().mockResolvedValue(findFirst), findMany: jest.fn() } };
    return { svc: new LeadAccessService(prisma), prisma, create };
  }

  it('records a lead view with actor, lead and roles', async () => {
    const { svc, create } = make();
    await svc.recordView('lead-1', exec, 'L-001');
    const data = create.mock.calls[0][0].data;
    expect(data).toMatchObject({ module: 'LeadAccess', action: 'Viewed', recordId: 'lead-1', actorName: 'Esha Exec' });
    expect(data.newValue).toMatchObject({ userId: 'u-exec', roles: ['Sales Executive'], leadNumber: 'L-001' });
  });

  it('does not log the same user re-opening the same lead within 5 minutes', async () => {
    const { svc, create } = make({ id: 'recent' });
    await svc.recordView('lead-1', exec);
    expect(create).not.toHaveBeenCalled();
  });

  it('records exports with the row count, and copy/print events', async () => {
    const { svc, create } = make();
    await svc.recordExport(manager, 42);
    await svc.recordClientEvent(exec, 'COPY', 'lead-1', { chars: 120 });
    await svc.recordClientEvent(exec, 'PRINT', null, { page: 'Leads list' });
    const actions = create.mock.calls.map((c) => c[0].data.action);
    expect(actions).toEqual(['Exported', 'Copied', 'Printed']);
    expect(create.mock.calls[0][0].data.newValue.count).toBe(42);
    expect(create.mock.calls[1][0].data.remarks).toContain('120');
  });

  it('never throws when the audit write fails', async () => {
    const prisma: any = { auditLog: { create: jest.fn().mockRejectedValue(new Error('db down')), findFirst: jest.fn() } };
    await expect(new LeadAccessService(prisma).recordExport(exec, 1)).resolves.toBeUndefined();
  });

  it('summary totals per user and flags heavy copiers / exporters', async () => {
    const rows: any[] = [];
    const at = new Date();
    for (let i = 0; i < SUSPICIOUS_THRESHOLDS.copies; i++) rows.push({ actorName: 'Heavy', action: 'Copied', recordId: 'l', newValue: {}, createdAt: at });
    for (let i = 0; i < 3; i++) rows.push({ actorName: 'Heavy', action: 'Exported', recordId: null, newValue: { count: 50 }, createdAt: at });
    rows.push({ actorName: 'Normal', action: 'Viewed', recordId: 'a', newValue: {}, createdAt: at });
    rows.push({ actorName: 'Normal', action: 'Viewed', recordId: 'b', newValue: {}, createdAt: at });
    const prisma: any = { auditLog: { findMany: jest.fn().mockResolvedValue(rows) } };
    const { users } = await new LeadAccessService(prisma).summary(30);
    const heavy = users.find((u) => u.actorName === 'Heavy')!;
    const normal = users.find((u) => u.actorName === 'Normal')!;
    expect(heavy.copied).toBe(10);
    expect(heavy.leadsExported).toBe(150);
    expect(heavy.flags).toEqual(expect.arrayContaining(['Copied 10 times', 'Exported 3 times']));
    expect(normal).toMatchObject({ viewed: 2, distinctLeadsViewed: 2, flags: [] });
    expect(users[0].actorName).toBe('Heavy'); // flagged users first
  });
});

describe('Lead reassignment approval', () => {
  const existing: any = {
    id: 'lead-1',
    status: 'ASSIGNED',
    assignedToUserId: 'u-exec',
    assignedToUser: { name: 'Esha Exec' },
    customerId: null,
    nextFollowUp: null,
  };

  function make() {
    const reqCreate = jest.fn().mockResolvedValue({ id: 'req-1', leadId: 'lead-1', toUserId: 'u-other' });
    const leadUpdate = jest.fn().mockResolvedValue({ ...existing, leadNumber: 'L-1' });
    const tx: any = {
      lead: { update: leadUpdate },
      leadProduct: { deleteMany: jest.fn() },
      leadHistory: { create: jest.fn() },
      leadAssignmentHistory: { create: jest.fn() },
      leadStatusHistory: { create: jest.fn() },
      user: { findUnique: jest.fn().mockResolvedValue({ name: 'Olive Other' }) },
    };
    const prisma: any = {
      lead: {},
      user: { findUnique: jest.fn().mockResolvedValue({ name: 'Olive Other', isActive: true }) },
      leadHistory: { create: jest.fn() },
      leadReassignmentRequest: {
        count: jest.fn().mockResolvedValue(0),
        create: reqCreate,
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((cb: any) => cb(tx)),
    };
    const svc: any = new (LeadsService as any)(prisma);
    svc.findOne = jest.fn().mockResolvedValue(existing);
    return { svc, prisma, leadUpdate, reqCreate };
  }

  it('Sales Executive reassigning gets a pending request; the lead keeps its owner', async () => {
    const { svc, leadUpdate, reqCreate } = make();
    const res = await svc.update('lead-1', { assignedToUserId: 'u-other' }, exec.name, exec);
    expect(reqCreate.mock.calls[0][0].data).toMatchObject({
      leadId: 'lead-1',
      fromUserId: 'u-exec',
      toUserId: 'u-other',
      toUserName: 'Olive Other',
      requestedBy: 'Esha Exec',
    });
    // The lead update never carried a new assignee.
    expect(leadUpdate.mock.calls[0][0].data).not.toHaveProperty('assignedToUserId');
    expect(res.reassignmentRequested).toBe(true);
  });

  it('a second request while one is pending is rejected', async () => {
    const { svc, prisma } = make();
    prisma.leadReassignmentRequest.count.mockResolvedValue(1);
    await expect(svc.update('lead-1', { assignedToUserId: 'u-other' }, exec.name, exec)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('an unchanged assignee (form re-save) is not a reassignment', async () => {
    const { svc, reqCreate } = make();
    const res = await svc.update('lead-1', { assignedToUserId: 'u-exec' }, exec.name, exec);
    expect(reqCreate).not.toHaveBeenCalled();
    expect(res.reassignmentRequested).toBeUndefined();
  });

  it('Sales Manager reassigns directly, no request', async () => {
    const { svc, leadUpdate, reqCreate } = make();
    await svc.update('lead-1', { assignedToUserId: 'u-other' }, manager.name, manager);
    expect(reqCreate).not.toHaveBeenCalled();
    expect(leadUpdate.mock.calls[0][0].data.assignedToUserId).toBe('u-other');
  });

  it('approve applies the assignment as the approver; a decided request cannot be decided again', async () => {
    const { svc, prisma } = make();
    const pending = { id: 'req-1', leadId: 'lead-1', toUserId: 'u-other', status: 'PENDING' };
    prisma.leadReassignmentRequest.findUnique.mockResolvedValueOnce(pending).mockResolvedValue({ ...pending, status: 'APPROVED' });
    prisma.leadReassignmentRequest.updateMany.mockResolvedValue({ count: 1 });
    const apply = jest.spyOn(svc, 'update').mockResolvedValue({} as any);
    await svc.decideReassignment('req-1', true, manager);
    expect(apply).toHaveBeenCalledWith('lead-1', { assignedToUserId: 'u-other' }, 'Manu Manager');
    expect(prisma.leadReassignmentRequest.updateMany.mock.calls[0][0].data).toMatchObject({
      status: 'APPROVED',
      decidedBy: 'Manu Manager',
    });

    prisma.leadReassignmentRequest.findUnique.mockResolvedValue({ ...pending, status: 'APPROVED' });
    await expect(svc.decideReassignment('req-1', true, manager)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reject leaves the lead untouched and logs it on the timeline', async () => {
    const { svc, prisma } = make();
    const pending = { id: 'req-1', leadId: 'lead-1', toUserId: 'u-other', toUserName: 'Olive Other', status: 'PENDING' };
    prisma.leadReassignmentRequest.findUnique.mockResolvedValue(pending);
    prisma.leadReassignmentRequest.updateMany.mockResolvedValue({ count: 1 });
    const apply = jest.spyOn(svc, 'update');
    await svc.decideReassignment('req-1', false, manager, 'Keep with Esha');
    expect(apply).not.toHaveBeenCalled();
    expect(prisma.leadHistory.create.mock.calls[0][0].data.description).toContain('rejected by Manu Manager');
  });

  it('if applying an approved reassignment fails, the request goes back to pending', async () => {
    const { svc, prisma } = make();
    prisma.leadReassignmentRequest.findUnique.mockResolvedValue({ id: 'req-1', leadId: 'lead-1', toUserId: 'u-other', status: 'PENDING' });
    prisma.leadReassignmentRequest.updateMany.mockResolvedValue({ count: 1 });
    jest.spyOn(svc, 'update').mockRejectedValue(new Error('boom'));
    await expect(svc.decideReassignment('req-1', true, manager)).rejects.toThrow('boom');
    expect(prisma.leadReassignmentRequest.update.mock.calls[0][0].data.status).toBe('PENDING');
  });
});
