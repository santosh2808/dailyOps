import { createHmac } from 'crypto';
import {
  parseGoogleColumns,
  parseMetaFieldData,
  safeEqual,
  verifyMetaSignature,
} from '../../src/inbound-leads/ad-lead-parsers';
import { InboundLeadsService } from '../../src/inbound-leads/inbound-leads.service';

describe('ad lead parsers', () => {
  it('parses Meta field_data incl. custom questions and ids', () => {
    const p = parseMetaFieldData(
      [
        { name: 'full_name', values: ['Ravi Kumar'] },
        { name: 'email', values: ['r@x.com'] },
        { name: 'phone_number', values: ['+919876543210'] },
        { name: 'company_name', values: ['Acme'] },
        { name: 'state', values: ['Telangana'] },
        { name: 'fan_size_needed', values: ['24 ft'] },
        { name: 'empty', values: [] },
      ],
      { formId: 'F1', campaignId: 'C1', adId: 'A1' },
    );
    expect(p).toMatchObject({ name: 'Ravi Kumar', email: 'r@x.com', phone: '+919876543210', company: 'Acme', state: 'Telangana' });
    expect(p.details).toContain('Fan size needed: 24 ft');
    expect(p.details).toContain('Form F1, Campaign C1, Ad A1');
    expect(p.details).not.toContain('Empty');
  });

  it('joins first/last name when full_name is absent', () => {
    expect(parseMetaFieldData([{ name: 'first_name', values: ['A'] }, { name: 'last_name', values: ['B'] }]).name).toBe('A B');
  });

  it('parses Google columns', () => {
    const p = parseGoogleColumns(
      [
        { column_id: 'FULL_NAME', string_value: 'Sita' },
        { column_id: 'PHONE_NUMBER', string_value: '9876543210' },
        { column_id: 'REGION', string_value: 'Karnataka' },
        { column_id: 'POSTAL_CODE', string_value: '560001' },
        { column_id: 'CUSTOM', column_name: 'Requirement', string_value: 'Warehouse' },
      ],
      { campaignId: 'C9' },
    );
    expect(p).toMatchObject({ name: 'Sita', phone: '9876543210', state: 'Karnataka' });
    expect(p.details).toContain('Requirement: Warehouse');
    expect(p.details).not.toContain('560001');
  });

  it('verifies Meta signatures', () => {
    const body = Buffer.from('{"a":1}');
    const sig = 'sha256=' + createHmac('sha256', 's3cret').update(body).digest('hex');
    expect(verifyMetaSignature(body, sig, 's3cret')).toBe(true);
    expect(verifyMetaSignature(body, sig, 'other')).toBe(false);
    expect(verifyMetaSignature(body, undefined, 's3cret')).toBe(false);
    expect(verifyMetaSignature(undefined, sig, 's3cret')).toBe(false);
    expect(verifyMetaSignature(body, 'sha256=abc', 's3cret')).toBe(false);
  });

  it('safeEqual handles length mismatch', () => {
    expect(safeEqual('a', 'a')).toBe(true);
    expect(safeEqual('a', 'ab')).toBe(false);
  });
});

describe('InboundLeadsService', () => {
  function build(existing: any = null) {
    const prisma: any = {
      inboundLeadEvent: {
        findUnique: jest.fn().mockResolvedValue(existing),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    const leads: any = { createFromAdLead: jest.fn().mockResolvedValue({ lead: { id: 'L1', leadNumber: 'LD-1' } }) };
    return { svc: new InboundLeadsService(prisma, leads), prisma, leads };
  }

  it('creates a lead and records the event', async () => {
    const { svc, prisma, leads } = build();
    const out = await svc.handleGoogle({ lead_id: 'g1', user_column_data: [{ column_id: 'FULL_NAME', string_value: 'X' }] });
    expect(out).toBe('created');
    expect(leads.createFromAdLead).toHaveBeenCalledWith(expect.objectContaining({ source: 'GOOGLE_ADS', name: 'X' }));
    expect(prisma.inboundLeadEvent.upsert.mock.calls[0][0].create.status).toBe('CREATED');
  });

  it('skips an already processed external id', async () => {
    const { svc, leads } = build({ status: 'CREATED' });
    expect(await svc.handleGoogle({ lead_id: 'g1' })).toBe('skipped');
    expect(leads.createFromAdLead).not.toHaveBeenCalled();
  });

  it('retries a previously FAILED event', async () => {
    const { svc, leads } = build({ status: 'FAILED' });
    expect(await svc.handleGoogle({ lead_id: 'g1' })).toBe('created');
    expect(leads.createFromAdLead).toHaveBeenCalled();
  });

  it('records duplicates', async () => {
    const { svc, prisma, leads } = build();
    leads.createFromAdLead.mockResolvedValue({ lead: { id: 'L0', leadNumber: 'LD-0' }, duplicateOf: true });
    expect(await svc.handleGoogle({ lead_id: 'g2' })).toBe('duplicate');
    expect(prisma.inboundLeadEvent.upsert.mock.calls[0][0].create.status).toBe('DUPLICATE');
  });

  it('records failure and reports it', async () => {
    const { svc, prisma, leads } = build();
    leads.createFromAdLead.mockRejectedValue(new Error('boom'));
    expect(await svc.handleGoogle({ lead_id: 'g3' })).toBe('failed');
    expect(prisma.inboundLeadEvent.upsert.mock.calls[0][0].create).toMatchObject({ status: 'FAILED', error: 'boom' });
  });

  it('Meta: fetches each leadgen change and counts failures', async () => {
    const { svc } = build();
    const fetchLead = jest
      .fn()
      .mockResolvedValueOnce({ field_data: [{ name: 'full_name', values: ['A'] }] })
      .mockRejectedValueOnce(new Error('graph down'));
    const res = await svc.handleMeta(
      { entry: [{ changes: [{ field: 'leadgen', value: { leadgen_id: '1' } }, { field: 'leadgen', value: { leadgen_id: '2' } }, { field: 'other', value: {} }] }] },
      fetchLead,
    );
    expect(res).toEqual({ processed: 1, duplicates: 0, failed: 1 });
  });
});
