import { LeadsService } from '../../src/leads/leads.service';

function setup(existing: Record<string, unknown>) {
  const tx: any = {
    lead: { update: jest.fn().mockImplementation(async ({ data }: any) => ({ ...existing, ...data })) },
    leadStatusHistory: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma: any = { $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)) };
  const svc = new LeadsService(prisma, {} as any, {} as any, {} as any);
  jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 'l1', status: 'ASSIGNED', siteVisitPhotos: [], ...existing } as any);
  jest.spyOn(svc as any, 'logHistory').mockResolvedValue(undefined);
  return { svc, tx };
}

describe('Lead status change remarks reach Lead.remarks', () => {
  it('saves the remark on the lead (also when the lead is unassigned)', async () => {
    const { svc, tx } = setup({ remarks: null, assignedToUserId: null });
    await svc.updateStatus('l1', { status: 'CONTACTED', remarks: 'Spoke to owner, wants a callback' } as any, 'Telecaller One');
    const data = tx.lead.update.mock.calls[0][0].data;
    expect(data.status).toBe('CONTACTED');
    expect(data.remarks).toMatch(/^\[\d{4}-\d{2}-\d{2} Telecaller One\] Spoke to owner, wants a callback$/);
  });

  it('appends to existing remarks instead of overwriting them', async () => {
    const { svc, tx } = setup({ remarks: 'Imported from Meta' });
    await svc.updateStatus('l1', { status: 'CONTACTED', remarks: 'Called' } as any, 'A');
    expect(tx.lead.update.mock.calls[0][0].data.remarks).toMatch(/^Imported from Meta\n\[.*\] Called$/);
  });

  it('leaves remarks untouched when no remark is given', async () => {
    const { svc, tx } = setup({ remarks: 'keep' });
    await svc.updateStatus('l1', { status: 'CONTACTED' } as any, 'A');
    expect(tx.lead.update.mock.calls[0][0].data).not.toHaveProperty('remarks');
  });
});
