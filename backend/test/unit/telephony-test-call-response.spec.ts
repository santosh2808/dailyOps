import { Logger } from '@nestjs/common';
import { TelephonyService } from '../../src/telephony/telephony.service';

// The manual D.O.T. Telephony Test endpoints keep their original response
// contract: the AI call-result columns added to TelephonyTestCall are
// stored but never returned by GET /telephony/test-calls or
// POST /telephony/test-call. No network: fetch is mocked and the Exotel
// settings are dummies pointing at an unroutable local address.

const ORIGINAL_FIELDS = [
  'id',
  'phone',
  'leadId',
  'status',
  'providerCallId',
  'providerStatus',
  'errorMessage',
  'recordingRef',
  'initiatedBy',
  'initiatedAt',
  'ringingAt',
  'answeredAt',
  'completedAt',
  'durationSeconds',
  'createdAt',
  'updatedAt',
].sort();

function prismaMock() {
  return {
    telephonyTestCall: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'tc-1' }),
      update: jest.fn().mockResolvedValue({ id: 'tc-1' }),
    },
    lead: { findFirst: jest.fn() },
  };
}

describe('Telephony Test endpoints — response contract unchanged', () => {
  const SAFE_ENV = {
    EXOTEL_ENABLED: 'true',
    EXOTEL_ACCOUNT_SID: 'SIMULATED',
    EXOTEL_API_KEY: 'SIMULATED',
    EXOTEL_API_TOKEN: 'SIMULATED',
    EXOTEL_CALLER_ID: 'SIMULATED',
    EXOTEL_BASE_URL: 'http://127.0.0.1:9',
    EXOTEL_FLOW_URL: '',
    TELEPHONY_STATUS_CALLBACK_URL: '',
  };
  const saved: Record<string, string | undefined> = {};
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    for (const [k, v] of Object.entries(SAFE_ENV)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    jest.restoreAllMocks();
  });

  it('GET /telephony/test-calls selects exactly the original fields plus the lead summary', async () => {
    const prisma = prismaMock();
    await new TelephonyService(prisma as any).listTestCalls();
    const { select } = prisma.telephonyTestCall.findMany.mock.calls[0][0];
    const { lead, ...fields } = select;
    expect(Object.keys(fields).sort()).toEqual(ORIGINAL_FIELDS);
    expect(lead).toEqual({ select: { id: true, leadNumber: true, companyName: true } });
    expect(Object.keys(select).some((k) => k.startsWith('aiResult'))).toBe(false);
  });

  it('POST /telephony/test-call (Exotel accepted) returns only the original fields', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ Call: { Sid: 'SIMULATED-sid' } }), { status: 200 }));
    const prisma = prismaMock();
    await new TelephonyService(prisma as any).initiateTestCall({ phone: '9000000101' } as any, 'Admin');
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringMatching(/^http:\/\/127\.0\.0\.1:9\//), expect.anything());
    const { select } = prisma.telephonyTestCall.update.mock.calls[0][0];
    expect(Object.keys(select).sort()).toEqual(ORIGINAL_FIELDS);
  });

  it('POST /telephony/test-call (Exotel refused) returns only the original fields', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ RestException: { Message: 'SIMULATED: insufficient balance' } }), { status: 400 }),
    );
    const prisma = prismaMock();
    await new TelephonyService(prisma as any).initiateTestCall({ phone: '9000000101' } as any, 'Admin');
    const { data, select } = prisma.telephonyTestCall.update.mock.calls[0][0];
    expect(data).toEqual({ status: 'FAILED', errorMessage: 'SIMULATED: insufficient balance' });
    expect(Object.keys(select).sort()).toEqual(ORIGINAL_FIELDS);
  });
});
