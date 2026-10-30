import { LeadsService } from '../../src/leads/leads.service';
import { mustSelfAssignNewLeads } from '../../src/leads/lead-visibility';

const SE = { id: 'se-1', role: 'admin', roles: ['Sales Executive'] };

function setup() {
  const tx: any = {
    lead: { create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'lead-1', leadNumber: 'LD-000001', ...data })) },
    leadStatusHistory: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma: any = {
    lead: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
  };
  const svc = new LeadsService(prisma, {} as any, {} as any, {} as any);
  jest.spyOn(svc as any, 'generateLeadNumber').mockResolvedValue('LD-000001');
  jest.spyOn(svc as any, 'logHistory').mockResolvedValue(undefined);
  jest.spyOn(svc as any, 'notifyLeadAssigned').mockResolvedValue(undefined);
  const dto: any = { contactPerson: 'Ravi', phone: '9000000001', title: 'Lead', state: 'Telangana', assignedToUserId: 'other-user' };
  const createdData = () => tx.lead.create.mock.calls[0][0].data;
  return { svc, dto, createdData };
}

describe('mustSelfAssignNewLeads', () => {
  it('applies to a Sales Executive with no full-visibility role', () => {
    expect(mustSelfAssignNewLeads(SE)).toBe(true);
    expect(mustSelfAssignNewLeads({ id: 'u', roles: ['sales_executive'] })).toBe(true);
  });

  it('keeps free choice for full-visibility roles, even alongside Sales Executive', () => {
    for (const roles of [['Administrator'], ['Sales Manager'], ['Telecaller'], ['Sales Executive', 'Sales Manager']]) {
      expect(mustSelfAssignNewLeads({ id: 'u', roles })).toBe(false);
    }
  });

  it('does not apply to other roles, internal callers, or a viewer without an id', () => {
    expect(mustSelfAssignNewLeads({ id: 'u', roles: ['Finance'] })).toBe(false);
    expect(mustSelfAssignNewLeads({ id: 'u', role: 'admin', roles: [] })).toBe(false);
    expect(mustSelfAssignNewLeads(undefined)).toBe(false);
    expect(mustSelfAssignNewLeads({ roles: ['Sales Executive'] })).toBe(false);
  });
});

describe('LeadsService.create — assignee', () => {
  it("assigns a Sales Executive's lead to themselves, ignoring the submitted assignee", async () => {
    const { svc, dto, createdData } = setup();
    await svc.create(dto, 'SE One', SE);
    expect(createdData()).toMatchObject({ assignedToUserId: 'se-1', status: 'ASSIGNED' });
  });

  it('keeps the submitted assignee for an Administrator or Sales Manager', async () => {
    for (const roles of [['Administrator'], ['Sales Manager']]) {
      const { svc, dto, createdData } = setup();
      await svc.create(dto, 'Manager', { id: 'mgr-1', roles });
      expect(createdData().assignedToUserId).toBe('other-user');
    }
  });

  it('keeps the submitted assignee when there is no session user (internal callers)', async () => {
    const { svc, dto, createdData } = setup();
    await svc.create(dto, 'System');
    expect(createdData().assignedToUserId).toBe('other-user');
  });
});
