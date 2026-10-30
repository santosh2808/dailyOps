import { LeadsService } from '../../src/leads/leads.service';

const CREATED = new Date('2026-10-01T09:00:00Z');
const at = (iso: string) => new Date(iso);

function setup(lead: Record<string, unknown>, history: { newStatus: string; createdAt: Date }[], firstAssignment?: Date) {
  const prisma: any = {
    leadStatusHistory: { findMany: jest.fn().mockResolvedValue(history) },
    leadAssignmentHistory: {
      findFirst: jest.fn().mockResolvedValue(firstAssignment ? { createdAt: firstAssignment } : null),
    },
  };
  const svc = new LeadsService(prisma, {} as any, {} as any, {} as any);
  jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 'l1', createdAt: CREATED, assignedToUserId: null, ...lead } as any);
  return { svc, prisma };
}

const step = (steps: { key: string }[], key: string) => steps.find((s) => s.key === key) as any;

describe('LeadsService.getPipelineTimeline — Assigned step', () => {
  it('marks Assigned done for a Qualified lead assigned later via Edit Lead (no ASSIGNED history)', async () => {
    const { svc } = setup(
      { status: 'QUALIFIED', assignedToUserId: 'se-1' },
      [{ newStatus: 'QUALIFIED', createdAt: at('2026-10-02T09:00:00Z') }],
      at('2026-10-03T09:00:00Z'),
    );
    const { steps } = await svc.getPipelineTimeline('l1');
    expect(step(steps, 'assigned')).toMatchObject({ done: true, at: at('2026-10-03T09:00:00Z') });
  });

  it('leaves Assigned incomplete for a Qualified lead with no salesperson', async () => {
    const { svc, prisma } = setup({ status: 'QUALIFIED' }, [{ newStatus: 'QUALIFIED', createdAt: at('2026-10-02T09:00:00Z') }]);
    const { steps } = await svc.getPipelineTimeline('l1');
    expect(step(steps, 'assigned')).toMatchObject({ done: false, at: null });
    expect(prisma.leadAssignmentHistory.findFirst).not.toHaveBeenCalled();
  });

  it('keeps the happy flow unchanged: assigned at creation uses the status-history time', async () => {
    const { svc, prisma } = setup({ status: 'ASSIGNED', assignedToUserId: 'se-1' }, [
      { newStatus: 'ASSIGNED', createdAt: CREATED },
    ]);
    const { steps } = await svc.getPipelineTimeline('l1');
    expect(step(steps, 'assigned')).toMatchObject({ done: true, at: CREATED });
    expect(prisma.leadAssignmentHistory.findFirst).not.toHaveBeenCalled();
  });

  it('still shows Completed (no date) when an owner exists but no assignment was ever recorded', async () => {
    const { svc } = setup({ status: 'CONTACTED', assignedToUserId: 'se-1' }, [
      { newStatus: 'CONTACTED', createdAt: at('2026-10-02T09:00:00Z') },
    ]);
    const { steps } = await svc.getPipelineTimeline('l1');
    expect(step(steps, 'assigned')).toMatchObject({ done: true, at: null });
  });

  it('does not change any other step', async () => {
    const { svc } = setup(
      { status: 'QUALIFIED', assignedToUserId: 'se-1' },
      [{ newStatus: 'QUALIFIED', createdAt: at('2026-10-02T09:00:00Z') }],
      at('2026-10-03T09:00:00Z'),
    );
    const { steps } = await svc.getPipelineTimeline('l1');
    expect(steps.map((s: any) => [s.key, s.done])).toEqual([
      ['new', true],
      ['assigned', true],
      ['contacted', false],
      ['site_visit', false],
      ['qualified', true],
      ['quotation_sent', false],
      ['won', false],
    ]);
  });
});
