import { createdAtRange } from '../../src/common/date-range.util';

describe('createdAtRange', () => {
  it('treats a plain end date as the whole IST day', () => {
    const r = createdAtRange('2026-10-21', '2026-10-21');
    expect(r.gte!.toISOString()).toBe('2026-10-20T18:30:00.000Z');
    expect(r.lt!.toISOString()).toBe('2026-10-21T18:30:00.000Z');
    expect(r.lte).toBeUndefined();
    // a lead created at 3pm IST on the 21st is inside; 00:10 IST on the 22nd is not
    const inside = new Date('2026-10-21T09:30:00.000Z');
    const outside = new Date('2026-10-21T18:40:00.000Z');
    expect(inside >= r.gte! && inside < r.lt!).toBe(true);
    expect(outside < r.lt!).toBe(false);
  });
  it('handles only-from, only-to and full ISO timestamps', () => {
    expect(createdAtRange('2026-10-01')).toEqual({ gte: new Date('2026-09-30T18:30:00.000Z') });
    expect(createdAtRange(undefined, '2026-10-31').lt!.toISOString()).toBe('2026-10-31T18:30:00.000Z');
    const iso = createdAtRange('2026-10-01T00:00:00.000Z', '2026-10-02T00:00:00.000Z');
    expect(iso.lte!.toISOString()).toBe('2026-10-02T00:00:00.000Z');
  });
});
