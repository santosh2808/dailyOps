import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import PDFDocument = require('pdfkit');
import type { ProductTechnicalSpec } from '../products/dto/create-product.dto';

// Branded "Techno-Commercial Offer" Quotation PDF — an exact reproduction
// of the customer-supplied reference template ("Pitambari - 14 feet as on
// 5th August.pdf"), with the Annexure-I technical specification table
// pulled live from whichever Product(s)/fan-size(s) are on the quotation
// (Product.technicalSpec — see that schema comment) instead of being
// hardcoded to one fan size. Deliberately duck-typed against a minimal
// shape rather than importing QuotationsService's Prisma payload type, so
// PdfModule never has to depend on QuotationsModule — any object matching
// this shape (the real Prisma Quotation-with-relations included) can be
// rendered.
export interface QuotationPdfCustomerLike {
  companyName?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface QuotationPdfItem {
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  product: {
    name: string;
    technicalSpec?: unknown;
  };
}

// Annexure-II (and part of Annexure-I's price schedule) turned out, from the
// customer's real quotations across all 8 fan sizes, to vary a lot order to
// order — GST "Included" vs "Extra", transportation "Included" vs "Extra at
// actual", 30/70 vs 80/20 vs 100% advance payment, 3 vs 15 vs 90 day offer
// validity, and so on. Every field here is optional free text set per
// quotation (Quotation.commercialTerms — see QuotationsService); anything
// left unset falls back to DEFAULT_COMMERCIAL_TERMS below. `unloading` and
// `installationSchedule` are the two lines that only some real quotations
// have at all, so they're omitted from the PDF entirely when unset rather
// than falling back to a default.
export interface QuotationCommercialTerms {
  regionCode?: string;
  priceBasis?: string;
  installationCharge?: string;
  transportation?: string;
  gstTerms?: string;
  packingForwarding?: string;
  transportInsurance?: string;
  unloading?: string;
  payment?: string;
  delivery?: string;
  installationSchedule?: string;
  offerValidity?: string;
}

export interface QuotationPdfInput {
  quotationNumber: string;
  createdAt: Date;
  gstPercent: number;
  gstAmount: number;
  subtotal: number;
  // Real currency amounts (added into grandTotal by QuotationsService) —
  // distinct from commercialTerms.installationCharge/transportation below,
  // which are just descriptive wording for the Annexure-I per-item rows
  // (e.g. "Rs.8,000 per fan" / "Extra at actual"). These are the actual
  // numbers shown in the always-rendered Quotation Summary block.
  installationCharge: number;
  transportationCharge: number;
  grandTotal: number;
  notes?: string | null;
  commercialTerms?: unknown;
  customer?: QuotationPdfCustomerLike | null;
  lead?: QuotationPdfCustomerLike | null;
  items: QuotationPdfItem[];
}

const DEFAULT_COMMERCIAL_TERMS: Required<
  Omit<QuotationCommercialTerms, 'regionCode' | 'unloading' | 'installationSchedule'>
> = {
  priceBasis: 'Ex-Works, Hyderabad',
  // Rs.8,000 per fan is the standard installation rate (see
  // INSTALLATION_RATE_PER_FAN in QuotationsService, which is what actually
  // computes Quotation.installationCharge) — this default text just
  // describes that basis on the Annexure-I row; the real chargeable amount
  // is shown in the Quotation Summary block.
  installationCharge: 'Rs.8,000 per fan',
  transportation: 'Extra at actual',
  gstTerms: 'Included',
  packingForwarding: 'Included',
  transportInsurance: 'To your account',
  payment: '100% advance along with the Purchase order.',
  delivery: '7-10 days from the date of PO / release of advance.',
  offerValidity: '90 days from the date of offer',
};

const ASSETS_DIR = path.join(__dirname, 'assets');
const LOGO_SPYRO = path.join(ASSETS_DIR, 'logo-spyro-fans.png');
const LOGO_SR = path.join(ASSETS_DIR, 'logo-smart-rotamach.jpg');
const PRODUCT_PHOTO = path.join(ASSETS_DIR, 'hvls-fan-photo.jpg');

const PAGE_MARGIN = 45;
const GREEN = '#4b8f29';
const BLUE = '#1f4e96';
const NAVY = '#1f3864';
const BORDER = '#94a3b8';

const COMPANY_NAME = 'SMART ROTAMACH PRIVATE LIMITED';
const COMPANY_ADDRESS = '# 6-2-982, 3rd Floor, GNR Arcade, Khairatabad, Hyderabad-500004, Telangana, India.';
const COMPANY_CONTACT_LINE = 'Sales Ph: 9949465932; Email : info@spyrofan.com; www.spyrofan.com';

// Identical boilerplate across every one of the customer's real quotations
// (all 8 fan sizes) — company-wide warranty disclaimer, not per-product, so
// it's a constant here rather than another Product.technicalSpec field.
const WARRANTY_CONDITIONS =
  'The above warranty is valid for the functioning of the fan and its allied electrical equipment, if there is any physical damage and opening of the equipment by others without notice to us shall not be considered into the warranty clause. The customer has to ensure clear power supply through a stabilizer to the drive. The warranty does not cover any damage caused due to voltage surges.';

const EXCLUSIONS = [
  'Scaffolding / Scissor Lift / Boom Lift / Hydra / Forklift required for installation.',
  'If the ceiling is RCC, the required structure other than above given scope shall be to your account.',
  'If there is any hanging pipe structure arrangement is required, the same shall be provided by client.',
  'Input Main Power Supply with proper earthing at floor level.',
  'Power Cable to the regulator (input power cable).',
  'Unloading of Fan from Transport, Plant internal movement and storage, preservation.',
  'Preparing site ready for installing Fan with Wiring, open floor.',
  'Any specific paint shall be charged extra @ Rs.10,000.00',
];

interface SpecRow {
  label: string;
  value: string;
}

@Injectable()
export class QuotationPdfService {
  private readonly logger = new Logger(QuotationPdfService.name);

  constructor() {
    // Logged once at boot so a wrong runtime path (e.g. a different
    // __dirname than expected, a build that didn't copy assets, etc.) is
    // visible in the startup logs rather than only showing up as blank
    // images the first time someone views a PDF.
    for (const [label, filePath] of [
      ['logo-spyro-fans.png', LOGO_SPYRO],
      ['logo-smart-rotamach.jpg', LOGO_SR],
      ['hvls-fan-photo.jpg', PRODUCT_PHOTO],
    ] as const) {
      this.logger.log(`${label} -> ${filePath} (exists: ${fs.existsSync(filePath)})`);
    }
  }

  render(quotation: QuotationPdfInput): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      try {
        this.draw(doc, quotation);
      } catch (error) {
        this.logger.error('Quotation PDF rendering failed', error instanceof Error ? error.stack : error);
        reject(error);
        return;
      }

      doc.end();
    });
  }

  private draw(doc: PDFKit.PDFDocument, quotation: QuotationPdfInput): void {
    const pageBottom = doc.page.height - PAGE_MARGIN - 45; // reserve room for the footer block
    const contentLeft = PAGE_MARGIN;
    const contentWidth = doc.page.width - PAGE_MARGIN * 2;

    const ensureSpace = (height: number) => {
      if (doc.y + height > pageBottom) {
        this.drawFooter(doc);
        doc.addPage();
        this.drawHeader(doc);
      }
    };

    this.drawHeader(doc);
    this.drawCoverPage(doc, quotation, contentLeft, contentWidth);

    this.drawFooter(doc);
    doc.addPage();
    this.drawHeader(doc);
    this.drawContentsBlock(doc, contentLeft, contentWidth);

    quotation.items.forEach((item, index) => {
      this.drawAnnexureIHeading(doc, quotation.items.length > 1 ? index + 1 : null, item, contentLeft, contentWidth, ensureSpace);
      const rows = this.buildSpecRows(item, quotation);
      for (const row of rows) {
        this.drawTwoColRow(doc, row.label, row.value, contentLeft, contentWidth, ensureSpace);
      }

      doc.moveDown(0.6);
      ensureSpace(24);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('black').text('Standard Scope of Supply Includes:', contentLeft, doc.y, { width: contentWidth });
      doc.moveDown(0.3);

      const scope = this.getTechnicalSpec(item)?.scopeOfSupply ?? [];
      if (scope.length === 0) {
        ensureSpace(16);
        doc.font('Helvetica-Oblique').fontSize(9).fillColor('#64748b').text('(No scope-of-supply items configured for this product yet.)', contentLeft, doc.y, { width: contentWidth });
        doc.moveDown(0.5);
      } else {
        this.drawTableHeaderRow(doc, ['Items', 'Quantity / Fan'], [contentWidth * 0.6, contentWidth * 0.4], contentLeft, ensureSpace);
        for (const row of scope) {
          this.drawTwoColDataRow(doc, row.item, row.quantityPerFan, [contentWidth * 0.6, contentWidth * 0.4], contentLeft, ensureSpace);
        }
      }
      doc.moveDown(0.8);
    });

    ensureSpace(24);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('black').text('EXCLUSIONS FROM THE SCOPE', contentLeft, doc.y, { width: contentWidth, align: 'center' });
    doc.moveDown(0.5);
    EXCLUSIONS.forEach((text, index) => {
      const height = doc.heightOfString(text, { width: contentWidth - 30 }) + 8;
      ensureSpace(height);
      const rowTop = doc.y;
      doc.font('Helvetica').fontSize(9.5).fillColor('black');
      doc.text(`${index + 1}.`, contentLeft, rowTop, { width: 24 });
      doc.text(text, contentLeft + 26, rowTop, { width: contentWidth - 26 });
      doc.y = rowTop + height;
    });

    {
      // Previously this block only rendered for multi-item quotations
      // (single-item quotations relied on the Annexure-I per-item price
      // rows alone). Now that Installation and Transportation are real
      // amounts on top of the fan subtotal — not just descriptive text —
      // every quotation needs this breakdown to show the actual Grand
      // Total, so it always renders.
      doc.moveDown(0.5);
      ensureSpace(90);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('black').text('Quotation Summary', contentLeft, doc.y, { width: contentWidth });
      doc.moveDown(0.3);
      const summaryLines: [string, string][] = [
        ['Subtotal (Fans)', this.formatCurrency(quotation.subtotal)],
        ['Installation Charges', this.formatCurrency(quotation.installationCharge)],
        ['Transportation Charges', this.formatCurrency(quotation.transportationCharge)],
        [`GST (${quotation.gstPercent}%)`, this.formatCurrency(quotation.gstAmount)],
        ['Grand Total', this.formatCurrency(quotation.grandTotal)],
      ];
      for (const [label, value] of summaryLines) {
        ensureSpace(16);
        const rowTop = doc.y;
        doc.font('Helvetica').fontSize(10).fillColor('black');
        doc.text(label, contentLeft, rowTop, { width: contentWidth - 150 });
        doc.font('Helvetica-Bold').text(value, contentLeft + contentWidth - 150, rowTop, { width: 150, align: 'right' });
        doc.y = rowTop + 16;
      }
    }

    doc.moveDown(0.6);
    ensureSpace(30);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('black').text('ANNEXURE – II', contentLeft, doc.y, { width: contentWidth, align: 'left' });
    doc.font('Helvetica-Bold').fontSize(11).text('COMMERCIAL TERMS & CONDITIONS', contentLeft, doc.y, { width: contentWidth, align: 'center' });
    doc.moveDown(0.5);

    const terms = this.resolveCommercialTerms(quotation);
    const commercialRows = this.buildCommercialTermsRows(terms, quotation.gstPercent);
    commercialRows.forEach((term, index) => {
      const valueHeight = doc.heightOfString(term.value, { width: contentWidth - 200 });
      const height = Math.max(valueHeight, 12) + 6;
      ensureSpace(height);
      const rowTop = doc.y;
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('black').text(`${index + 1}.`, contentLeft, rowTop, { width: 22 });
      doc.text(term.label, contentLeft + 22, rowTop, { width: 140 });
      doc.font('Helvetica').text(':', contentLeft + 165, rowTop, { width: 12 });
      doc.text(term.value, contentLeft + 180, rowTop, { width: contentWidth - 180 });
      doc.y = rowTop + height;
    });

    const bankHeight = 70;
    ensureSpace(bankHeight);
    const bankTop = doc.y;
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('black').text(`${commercialRows.length + 1}.`, contentLeft, bankTop, { width: 22 });
    doc.text('Bank Details', contentLeft + 22, bankTop, { width: 140 });
    doc.font('Helvetica').text(':', contentLeft + 165, bankTop, { width: 12 });
    doc.font('Helvetica-Bold').fillColor(NAVY);
    doc.text(COMPANY_NAME, contentLeft + 180, bankTop, { width: contentWidth - 180 });
    doc.text('ICICI Bank; Account Number: 007605007585', contentLeft + 180, doc.y, { width: contentWidth - 180 });
    doc.text('Branch: Jubilee hills', contentLeft + 180, doc.y, { width: contentWidth - 180 });
    doc.text('IFSC: ICIC0000076', contentLeft + 180, doc.y, { width: contentWidth - 180 });
    doc.fillColor('black');
    doc.moveDown(1);

    if (quotation.notes && quotation.notes.trim()) {
      ensureSpace(40);
      doc.font('Helvetica-Bold').fontSize(9.5).text('Additional Notes:', contentLeft, doc.y, { width: contentWidth });
      doc.font('Helvetica').fontSize(9.5).text(quotation.notes.trim(), contentLeft, doc.y, { width: contentWidth });
      doc.moveDown(0.8);
    }

    ensureSpace(50);
    doc.font('Helvetica-Bold').fontSize(10).text(`For ${COMPANY_NAME}`, contentLeft, doc.y, { width: contentWidth });
    doc.moveDown(2);
    ensureSpace(16);
    doc.font('Helvetica-Bold').fontSize(10).text('AUTHORISED SIGNATORY', contentLeft, doc.y, { width: contentWidth });

    this.drawFooter(doc);
  }

  // ---- Header / Footer (repeated on every page) ------------------------

  private drawHeader(doc: PDFKit.PDFDocument): void {
    const top = PAGE_MARGIN;
    const contentLeft = PAGE_MARGIN;
    const contentWidth = doc.page.width - PAGE_MARGIN * 2;

    this.safeImage(doc, LOGO_SR, contentLeft, top, { height: 34 });
    this.safeImage(doc, LOGO_SPYRO, contentLeft + contentWidth - 70, top, { height: 34 });

    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(GREEN);
    doc.text(COMPANY_NAME, contentLeft, top + 40, { width: contentWidth, align: 'center' });
    doc.font('Helvetica').fontSize(7.5).fillColor('black');
    doc.text(COMPANY_ADDRESS, contentLeft, doc.y, { width: contentWidth, align: 'center' });
    doc.text(COMPANY_CONTACT_LINE, contentLeft, doc.y, { width: contentWidth, align: 'center' });
    doc.moveDown(0.4);
    doc.moveTo(contentLeft, doc.y).lineTo(contentLeft + contentWidth, doc.y).strokeColor(BORDER).stroke();
    doc.moveDown(0.6);
    doc.fillColor('black');
  }

  private drawFooter(doc: PDFKit.PDFDocument): void {
    const contentLeft = PAGE_MARGIN;
    const contentWidth = doc.page.width - PAGE_MARGIN * 2;
    const y = doc.page.height - PAGE_MARGIN - 32;

    doc.moveTo(contentLeft, y - 6).lineTo(contentLeft + contentWidth, y - 6).strokeColor(BORDER).stroke();
    doc.font('Helvetica-Bold').fontSize(9).fillColor(GREEN).text(COMPANY_NAME, contentLeft, y, { width: contentWidth, align: 'center' });
    doc.font('Helvetica').fontSize(7).fillColor('black');
    doc.text(COMPANY_ADDRESS, contentLeft, doc.y, { width: contentWidth, align: 'center' });
    doc.text(COMPANY_CONTACT_LINE, contentLeft, doc.y, { width: contentWidth, align: 'center' });
    doc.fillColor('black');
  }

  // ---- Page 1: Cover ----------------------------------------------------

  private drawCoverPage(
    doc: PDFKit.PDFDocument,
    quotation: QuotationPdfInput,
    contentLeft: number,
    contentWidth: number,
  ): void {
    const dateStr = this.formatDate(quotation.createdAt);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('black');
    doc.text(`REF: ${quotation.quotationNumber}, DATE: ${dateStr}`, contentLeft, doc.y, {
      width: contentWidth,
      underline: true,
    });
    doc.moveDown(1);

    const modelLabel = this.buildModelTitle(quotation.items);
    doc.font('Helvetica-Bold').fontSize(14).fillColor('black');
    doc.text('TECHNO-COMMERCIAL OFFER FOR', contentLeft, doc.y, { width: contentWidth, align: 'center' });
    doc.text(modelLabel, contentLeft, doc.y, { width: contentWidth, align: 'center' });
    doc.fillColor(BLUE).fontSize(12);
    doc.text('MADE – IN – INDIA PRODUCT', contentLeft, doc.y, { width: contentWidth, align: 'center' });
    doc.text('ZERO MAINTENANCE EQUIPMENT', contentLeft, doc.y, { width: contentWidth, align: 'center' });
    doc.fillColor('black');
    doc.moveDown(1.5);

    // Bounding box, not a fixed width — the reference photo (near-square)
    // and the customer-supplied replacement photo (portrait, 3:4) need
    // different scaling to both fit without overflowing into the BY/KIND
    // ATTEN block below. `fit` preserves aspect ratio within the box and
    // centers it, so either shape renders correctly.
    const photoBoxWidth = 230;
    const photoBoxHeight = 260;
    const photoX = contentLeft + (contentWidth - photoBoxWidth) / 2;
    this.safeImage(doc, PRODUCT_PHOTO, photoX, doc.y, {
      fit: [photoBoxWidth, photoBoxHeight],
      align: 'center',
      valign: 'center',
    });
    doc.y += photoBoxHeight;

    doc.moveDown(1);
    const recipient = quotation.customer ?? quotation.lead ?? undefined;
    const customerLine = recipient?.companyName?.trim() || '—';
    const rows: [string, string][] = [
      ['BY', 'SPYRO FANS'],
      ['CUSTOMER', customerLine],
      ['KIND ATTEN', recipient?.contactPerson?.trim() || '—'],
      ['PHONE NUMBER', recipient?.phone?.trim() || '—'],
      ['EMAIL ID', recipient?.email?.trim() || '—'],
    ];
    doc.font('Helvetica-Bold').fontSize(10);
    for (const [label, value] of rows) {
      const rowTop = doc.y;
      doc.font('Helvetica-Bold').text(label, contentLeft + 60, rowTop, { width: 110 });
      doc.text(':', contentLeft + 170, rowTop, { width: 12 });
      doc.font('Helvetica-Bold').fillColor(NAVY).text(value, contentLeft + 190, rowTop, { width: contentWidth - 190 });
      doc.fillColor('black');
      doc.y = rowTop + 16;
    }
  }

  private buildModelTitle(items: QuotationPdfItem[]): string {
    const labels = [
      ...new Set(
        items.map((item) => {
          const spec = this.getTechnicalSpec(item);
          return (spec?.modelNo?.trim() || item.product.name).toUpperCase();
        }),
      ),
    ];
    if (labels.length === 0) return 'HVLS SPYRO FAN MODEL';
    if (labels.length === 1) return `HVLS ${labels[0]} MODEL`;
    return `HVLS ${labels.join(' & ')} MODELS`;
  }

  // ---- Page 2: Contents --------------------------------------------------

  private drawContentsBlock(doc: PDFKit.PDFDocument, contentLeft: number, contentWidth: number): void {
    doc.font('Helvetica-Bold').fontSize(12).fillColor('black');
    doc.text('CONTENTS', contentLeft, doc.y, { width: contentWidth, align: 'center' });
    doc.moveDown(0.5);

    const col1 = 110;
    const rows: [string, string][] = [
      ['ANNEXURE – I', 'SCOPE OF SUPPLY | TECHNICAL SPECIFICATIONS | PRICE SCHEDULE | EXCLUSIONS'],
      ['ANNEXURE – II', 'COMMERCIAL TERMS & CONDITIONS'],
    ];
    doc.lineWidth(0.5).strokeColor(BORDER);
    const tableTop = doc.y;
    let y = tableTop;
    for (const [label, value] of rows) {
      const height = Math.max(doc.heightOfString(value, { width: contentWidth - col1 - 16 }), 12) + 8;
      doc.rect(contentLeft, y, col1, height).stroke();
      doc.rect(contentLeft + col1, y, contentWidth - col1, height).stroke();
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('black').text(label, contentLeft + 6, y + 4, { width: col1 - 12 });
      doc.font('Helvetica').text(value, contentLeft + col1 + 6, y + 4, { width: contentWidth - col1 - 16 });
      y += height;
    }
    doc.y = y + 16;

    doc.font('Helvetica-Bold').fontSize(11).fillColor('black');
    doc.text('ANNEXURE – I', contentLeft, doc.y, { width: contentWidth, align: 'center' });
    doc.text('SCOPE OF SUPPLY | TECHNICAL SPECIFICATIONS | PRICE SCHEDULE | EXCLUSIONS', contentLeft, doc.y, {
      width: contentWidth,
      align: 'center',
    });
    doc.moveDown(0.5);
  }

  private drawAnnexureIHeading(
    doc: PDFKit.PDFDocument,
    itemNumber: number | null,
    item: QuotationPdfItem,
    contentLeft: number,
    contentWidth: number,
    ensureSpace: (h: number) => void,
  ): void {
    if (itemNumber == null) return;
    ensureSpace(24);
    const spec = this.getTechnicalSpec(item);
    const label = spec?.modelNo?.trim() || item.product.name;
    doc.moveDown(itemNumber === 1 ? 0 : 0.8);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(BLUE);
    doc.text(`Item ${itemNumber}: ${label} (Qty: ${item.quantity})`, contentLeft, doc.y, { width: contentWidth });
    doc.fillColor('black');
    doc.moveDown(0.3);
  }

  // ---- Generic table row helpers ----------------------------------------

  private drawTwoColRow(
    doc: PDFKit.PDFDocument,
    label: string,
    value: string,
    contentLeft: number,
    contentWidth: number,
    ensureSpace: (h: number) => void,
  ): void {
    const col1 = 200;
    const col2 = contentWidth - col1;
    const height =
      Math.max(
        doc.heightOfString(label, { width: col1 - 12 }),
        doc.heightOfString(value, { width: col2 - 12 }),
      ) + 8;
    ensureSpace(height);
    const y = doc.y;
    doc.lineWidth(0.5).strokeColor(BORDER);
    doc.rect(contentLeft, y, col1, height).stroke();
    doc.rect(contentLeft + col1, y, col2, height).stroke();
    doc.font('Helvetica').fontSize(9.5).fillColor('black');
    doc.text(label, contentLeft + 6, y + 4, { width: col1 - 12 });
    doc.text(value, contentLeft + col1 + 6, y + 4, { width: col2 - 12 });
    doc.y = y + height;
  }

  private drawTableHeaderRow(
    doc: PDFKit.PDFDocument,
    labels: string[],
    widths: number[],
    contentLeft: number,
    ensureSpace: (h: number) => void,
  ): void {
    const height = 20;
    ensureSpace(height);
    const y = doc.y;
    let x = contentLeft;
    doc.lineWidth(0.5).strokeColor(BORDER);
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('black');
    labels.forEach((label, i) => {
      doc.rect(x, y, widths[i], height).fillAndStroke('#eef2f7', BORDER);
      doc.fillColor('black').text(label, x + 6, y + 5, { width: widths[i] - 12 });
      x += widths[i];
    });
    doc.y = y + height;
  }

  private drawTwoColDataRow(
    doc: PDFKit.PDFDocument,
    col1Text: string,
    col2Text: string,
    widths: number[],
    contentLeft: number,
    ensureSpace: (h: number) => void,
  ): void {
    const height =
      Math.max(
        doc.heightOfString(col1Text, { width: widths[0] - 12 }),
        doc.heightOfString(col2Text, { width: widths[1] - 12 }),
      ) + 8;
    ensureSpace(height);
    const y = doc.y;
    doc.lineWidth(0.5).strokeColor(BORDER);
    doc.rect(contentLeft, y, widths[0], height).stroke();
    doc.rect(contentLeft + widths[0], y, widths[1], height).stroke();
    doc.font('Helvetica').fontSize(9.5).fillColor('black');
    doc.text(col1Text, contentLeft + 6, y + 4, { width: widths[0] - 12 });
    doc.text(col2Text, contentLeft + widths[0] + 6, y + 4, { width: widths[1] - 12 });
    doc.y = y + height;
  }

  // ---- Commercial terms (Annexure-II + part of Annexure-I) ---------------

  private resolveCommercialTerms(quotation: QuotationPdfInput): QuotationCommercialTerms {
    const raw = quotation.commercialTerms;
    const given = raw && typeof raw === 'object' ? (raw as QuotationCommercialTerms) : {};
    return { ...DEFAULT_COMMERCIAL_TERMS, ...given };
  }

  private buildCommercialTermsRows(terms: QuotationCommercialTerms, gstPercent: number): SpecRow[] {
    const rows: SpecRow[] = [
      { label: 'Price', value: terms.priceBasis || DEFAULT_COMMERCIAL_TERMS.priceBasis },
      { label: 'Taxes', value: `GST ${gstPercent}% ${terms.gstTerms || DEFAULT_COMMERCIAL_TERMS.gstTerms}` },
      { label: 'Transportation', value: terms.transportation || DEFAULT_COMMERCIAL_TERMS.transportation },
      { label: 'Packing & Forwarding', value: terms.packingForwarding || DEFAULT_COMMERCIAL_TERMS.packingForwarding },
      { label: 'Transport Insurance', value: terms.transportInsurance || DEFAULT_COMMERCIAL_TERMS.transportInsurance },
    ];
    if (terms.unloading && terms.unloading.trim()) {
      rows.push({ label: 'Unloading at site', value: terms.unloading.trim() });
    }
    rows.push({ label: 'Payment', value: terms.payment || DEFAULT_COMMERCIAL_TERMS.payment });
    if (terms.installationSchedule && terms.installationSchedule.trim()) {
      rows.push({ label: 'Installation', value: terms.installationSchedule.trim() });
    }
    rows.push({ label: 'Delivery', value: terms.delivery || DEFAULT_COMMERCIAL_TERMS.delivery });
    rows.push({ label: 'Offer Validity', value: terms.offerValidity || DEFAULT_COMMERCIAL_TERMS.offerValidity });
    return rows;
  }

  // ---- Spec row construction ---------------------------------------------

  private getTechnicalSpec(item: QuotationPdfItem): ProductTechnicalSpec | undefined {
    const raw = item.product.technicalSpec;
    if (!raw || typeof raw !== 'object') return undefined;
    return raw as ProductTechnicalSpec;
  }

  private buildSpecRows(item: QuotationPdfItem, quotation: QuotationPdfInput): SpecRow[] {
    const spec = this.getTechnicalSpec(item) ?? {};
    const dash = (v?: string) => (v && v.trim() ? v.trim() : '—');
    const terms = this.resolveCommercialTerms(quotation);

    return [
      { label: 'Manufacturer (Make)', value: COMPANY_NAME },
      { label: 'Model No.', value: dash(spec.modelNo) },
      { label: 'Fan Size', value: dash(spec.fanSize) },
      { label: 'No. of Blades', value: dash(spec.noOfBlades) },
      { label: 'Air Volume', value: dash(spec.airVolume) },
      { label: 'Coverage Area', value: dash(spec.coverageArea) },
      { label: 'Motor Rating', value: dash(spec.motorRating) },
      { label: 'Speed', value: dash(spec.speed) },
      { label: 'Noise', value: dash(spec.noise) },
      { label: 'Weight (Approx.)', value: dash(spec.weight) },
      { label: '3 Phase Drive – Vol (V)', value: dash(spec.threePhaseVoltage) },
      { label: '3 Phase Drive – Current (A)', value: dash(spec.threePhaseCurrent) },
      { label: '1 Phase Drive – Vol (V)', value: dash(spec.onePhaseVoltage) },
      { label: '1 Phase Drive – Current (A)', value: dash(spec.onePhaseCurrent) },
      { label: 'Frequency (Hz)', value: dash(spec.frequency) },
      { label: 'Construction – Frame Structure', value: dash(spec.frameStructure) },
      { label: 'Construction – Hanging Structure', value: dash(spec.hangingStructure) },
      { label: 'Construction – Fasteners', value: dash(spec.fasteners) },
      { label: 'Blades – Design', value: dash(spec.bladeDesign) },
      { label: 'Blades – M.O.C.', value: dash(spec.bladeMoc) },
      { label: 'Blades – Sectional Width', value: dash(spec.bladeSectionalWidth) },
      { label: 'Drive Type', value: dash(spec.driveType) },
      { label: 'Control Panel – Mounting', value: dash(spec.controlPanelMounting) },
      { label: 'Control Panel – PMSM Drive', value: dash(spec.controlPanelDrive) },
      { label: 'Control Panel – Enclosure', value: dash(spec.controlPanelEnclosure) },
      { label: 'Compatibility', value: dash(spec.bmsCompatibility) },
      { label: 'Safety – Certification', value: dash(spec.safetyCertification) },
      { label: 'Safety – Bolted Joints', value: dash(spec.boltedJoints) },
      { label: 'Warranty – Motor', value: dash(spec.warrantyMotor) },
      { label: 'Warranty – Drive', value: dash(spec.warrantyDrive) },
      { label: 'Warranty – Other', value: dash(spec.warrantyOther) },
      { label: 'Warranty Conditions', value: WARRANTY_CONDITIONS },
      { label: 'Unit Price', value: `${this.formatCurrency(item.unitPrice)} Each` },
      { label: 'Installation', value: terms.installationCharge || DEFAULT_COMMERCIAL_TERMS.installationCharge },
      {
        label: 'Transportation',
        // Once a real transportation amount has actually been entered for
        // this quotation, show that number instead of the generic "Extra at
        // actual" wording — the exact figure is more useful to the customer
        // than the placeholder text once it's known.
        value:
          quotation.transportationCharge > 0
            ? `${this.formatCurrency(quotation.transportationCharge)} (Total, all fans)`
            : terms.transportation || DEFAULT_COMMERCIAL_TERMS.transportation,
      },
      { label: `GST ${quotation.gstPercent}%`, value: terms.gstTerms || DEFAULT_COMMERCIAL_TERMS.gstTerms },
      { label: 'Quantity', value: `${item.quantity} Nos.` },
    ];
  }

  // ---- Small utilities ----------------------------------------------------

  private safeImage(
    doc: PDFKit.PDFDocument,
    filePath: string,
    x: number,
    y: number,
    options: PDFKit.Mixins.ImageOption,
  ): void {
    try {
      if (fs.existsSync(filePath)) {
        doc.image(filePath, x, y, options);
      } else {
        // Previously this branch failed silently — a missing file never hit
        // the catch block below, so nothing was logged at all. Log it so a
        // path mismatch (e.g. a different __dirname than expected at
        // runtime) is visible instead of just producing a blank image area.
        this.logger.warn(`Image not found, skipping: ${filePath}`);
      }
    } catch (error) {
      this.logger.warn(`Could not embed image ${filePath}: ${error instanceof Error ? error.message : error}`);
    }
  }

  private formatCurrency(value: number): string {
    return `Rs.${Math.round(value).toLocaleString('en-IN')}`;
  }

  private formatDate(date: Date): string {
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
  }
}
