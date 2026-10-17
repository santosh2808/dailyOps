import { QuotationPdfService } from '../../src/pdf/quotation-pdf.service';

// Regression: installation is a quotation-level total (Rs.8,000 per fan).
// Each product's Annexure must show only its own share, not the full total.
describe('Quotation PDF installation per item', () => {
  const svc: any = new QuotationPdfService();
  const fan = (qty: number) => ({ quantity: qty, product: { technicalSpec: { fanSize: 'x' } } });
  const quotation: any = {
    installationCharge: 48000,
    items: [fan(5), fan(1)],
  };

  it('splits 48,000 into 40,000 (5 fans) + 8,000 (1 fan)', () => {
    expect(svc.installationShareForItem(quotation.items[0], quotation)).toEqual({ share: 40000, qty: 5 });
    expect(svc.installationShareForItem(quotation.items[1], quotation)).toEqual({ share: 8000, qty: 1 });
  });

  it('single fan item keeps the full total (no split)', () => {
    const single: any = { installationCharge: 40000, items: [fan(5)] };
    expect(svc.installationShareForItem(single.items[0], single)).toBeNull();
  });

  it('spare parts get no installation share', () => {
    const q: any = { installationCharge: 8000, items: [fan(1), { quantity: 2, product: { technicalSpec: null } }] };
    expect(svc.installationShareForItem(q.items[1], q)).toBeNull();
  });
});
