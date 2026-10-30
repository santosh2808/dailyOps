import { LeadsService } from '../../src/leads/leads.service';

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
  const dto: any = { contactPerson: 'Ravi', phone: '9000000001', title: 'Lead', state: 'Telangana', assignedToUserId: 'se-1' };
  return { svc, dto, createdData: () => tx.lead.create.mock.calls[0][0].data };
}

describe('LeadsService.create — lead source', () => {
  it('records DAILYOPS when no source is sent', async () => {
    const { svc, dto, createdData } = setup();
    await svc.create(dto, 'Admin');
    expect(createdData().source).toBe('DAILYOPS');
  });

  it('keeps a source the user chose on the form', async () => {
    for (const source of ['REFERENCE', 'TRADE_SHOW', 'OTHER']) {
      const { svc, dto, createdData } = setup();
      await svc.create({ ...dto, source }, 'Admin');
      expect(createdData().source).toBe(source);
    }
  });
});
