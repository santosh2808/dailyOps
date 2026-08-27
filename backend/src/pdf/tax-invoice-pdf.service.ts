import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import PDFDocument = require('pdfkit');

// Branded GST "Tax Invoice" PDF — an exact-as-practical reproduction of the
// customer-supplied reference template (SRM/2026-27/134, a Tally-generated
// invoice). Self-contained (no imports from proforma-invoice-pdf.service.ts
// or quotation-pdf.service.ts) — same "one file per branded template, no
// cross-file coupling" convention already established there, even though a
// handful of constants (company name/address/bank details) are duplicated
// rather than shared. Printed as three consecutive pages in one PDF, one
// per Tally-style copy label (matching the reference exactly): ORIGINAL FOR
// RECIPIENT, DUPLICATE FOR TRANSPORTER, TRIPLICATE FOR SUPPLIER.
export interface TaxInvoicePdfCustomer {
  companyName: string;
  contactPerson?: string | null;
  state?: string | null;
  gstNumber?: string | null;
}

export interface TaxInvoicePdfItem {
  quantity: number;
  unitPrice: number;
  discount: number;
  tax: number;
  lineTotal: number;
  description?: string | null;
  product: { name: string };
}

export interface TaxInvoicePdfInput {
  invoiceNumber: string;
  invoiceDate: Date;
  customer: TaxInvoicePdfCustomer;
  // Free-text, multi-line (see SalesOrder.shippingAddress/billingAddress) —
  // there is no structured postal-address field on Customer itself.
  shippingAddress?: string | null;
  billingAddress?: string | null;
  buyersOrderNo?: string | null;
  dispatchedThrough?: string | null;
  destination?: string | null;
  termsOfDelivery?: string | null;
  paymentTerms?: string | null;
  items: TaxInvoicePdfItem[];
  subtotal: number;
  tax: number;
  grandTotal: number;
}

const ASSETS_DIR = path.join(__dirname, 'assets');
const LOGO_SR = path.join(ASSETS_DIR, 'logo-smart-rotamach.jpg');

const PAGE_MARGIN = 40;
const BORDER = '#334155';

const COMPANY_NAME = 'SMART ROTAMACH PRIVATE LIMITED';
const COMPANY_ADDRESS_LINES = ['#6-2-982, 3rd Floor, GNR Arcade,', 'Khairatabad, Hyderabad - 500 004'];
// Same GSTIN already used on the Proforma Invoice / Quotation PDFs (see
// their own COMPANY_GST constants) — this legal entity has exactly one GST
// registration. UDYAM/CIN/PAN below are new — this is the first branded
// template that needed them (see schema.prisma / research notes: no
// existing field anywhere stored these before this feature).
const COMPANY_GST = '36ABECS1637F1ZG';
const COMPANY_UDYAM = 'UDYAM-TS-02-0075487 (Micro)';
const COMPANY_CIN = 'U74999TG2020PTC142713';
const COMPANY_PAN = 'ABECS1637F';
const COMPANY_EMAIL = 'admin@smartrotamac.com';
// The company's own home state for GST purposes — determines whether a
// given Sales Order is an intra-state supply (CGST + SGST, split evenly)
// or inter-state (IGST, one combined rate). Matches the reference
// template's "State Name : Telangana, Code : 36" company block exactly.
const COMPANY_STATE = 'Telangana';
const COMPANY_STATE_CODE = '36';

const DEFAULT_BANK_NAME = 'ICICI Bank';
const DEFAULT_ACCOUNT_NUMBER = '007605007585';
const DEFAULT_BRANCH = 'Jubilee Hills Branch, Hyderabad';
const DEFAULT_IFSC = 'ICIC0000076';

// Fans (HSN 84145120) are the only product category this app sells today,
// plus the "Installation" service line every HVLS order includes (SAC
// 9987) — matching the reference invoice's two line items exactly. If a
// genuinely different product/service category is ever added, this
// heuristic (matched against the line's description/product name) should
// move onto a real Product.hsnCode/sacCode column instead of staying a
// couple of global constants + a keyword match. Deliberately a different
// HSN than the Proforma Invoice PDF's own HSN_CODE_FANS constant
// ('84145990') — that discrepancy already existed in this codebase/Tally's
// own records before this feature and is out of scope to reconcile here;
// this file matches the uploaded Tax Invoice reference exactly.
const HSN_CODE_FAN = '84145120';
const SAC_INSTALLATION = '9987';

// Official GST state codes for every entry in INDIA_STATES (see
// backend/src/common/india-states.ts) — needed for the "State Name : X,
// Code : NN" line the reference template prints for both the company and
// the customer. Kept local to this file (not shared with india-states.ts)
// since nothing else in the app needs GST codes yet.
const GST_STATE_CODES: Record<string, string> = {
  'Jammu & Kashmir': '01',
  'Himachal Pradesh': '02',
  Punjab: '03',
  Chandigarh: '04',
  Uttarakhand: '05',
  Haryana: '06',
  Delhi: '07',
  Rajasthan: '08',
  'Uttar Pradesh': '09',
  Bihar: '10',
  Sikkim: '11',
  'Arunachal Pradesh': '12',
  Nagaland: '13',
  Manipur: '14',
  Mizoram: '15',
  Tripura: '16',
  Meghalaya: '17',
  Assam: '18',
  'West Bengal': '19',
  Jharkhand: '20',
  Odisha: '21',
  Chhattisgarh: '22',
  'Madhya Pradesh': '23',
  Gujarat: '24',
  'Dadra and Nagar Haveli and Daman and Diu': '26',
  Maharashtra: '27',
  Karnataka: '29',
  Goa: '30',
  Lakshadweep: '31',
  Kerala: '32',
  'Tamil Nadu': '33',
  Puducherry: '34',
  'Andaman & Nicobar': '35',
  Telangana: '36',
  'Andhra Pradesh': '37',
  Ladakh: '38',
};

const COPY_LABELS = ['ORIGINAL FOR RECIPIENT', 'DUPLICATE FOR TRANSPORTER', 'TRIPLICATE FOR SUPPLIER'];

@Injectable()
export class TaxInvoicePdfService {
  private readonly logger = new Logger(TaxInvoicePdfService.name);

  render(invoice: TaxInvoicePdfInput): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      try {
        COPY_LABELS.forEach((label, index) => {
          if (index > 0) doc.addPage();
          this.draw(doc, invoice, label);
        });
      } catch (error) {
        this.logger.error('Tax Invoice PDF rendering failed', error instanceof Error ? error.stack : error);
        reject(error);
        return;
      }

      doc.end();
    });
  }

  private draw(doc: PDFKit.PDFDocument, invoice: TaxInvoicePdfInput, copyLabel: string): void {
    const contentLeft = PAGE_MARGIN;
    const contentWidth = doc.page.width - PAGE_MARGIN * 2;
    const col1 = Math.round(contentWidth * 0.55);
    const col2 = contentWidth - col1;

    doc.y = PAGE_MARGIN;

    // Title bar: "Tax Invoice" centered, copy label right-aligned italic —
    // matches the reference exactly.
    doc.font('Helvetica-Bold').fontSize(14).fillColor('black');
    doc.text('Tax Invoice', contentLeft, doc.y, { width: contentWidth, align: 'center' });
    doc.font('Helvetica-Oblique').fontSize(9);
    doc.text(`(${copyLabel})`, contentLeft, doc.y - 14, { width: contentWidth, align: 'right' });
    doc.moveDown(0.4);

    const isIntraState = (invoice.customer.state ?? '').trim() === COMPANY_STATE;
    const customerStateCode = invoice.customer.state ? GST_STATE_CODES[invoice.customer.state] ?? '—' : '—';

    // Left column: Company block, then Consignee (Ship to), then Buyer
    // (Bill to) — stacked, matching the reference's left-hand column.
    const shippingLines = this.splitAddress(invoice.shippingAddress);
    const billingLines = this.splitAddress(invoice.billingAddress);
    const leftLines: { text: string; bold: boolean }[] = [
      { text: COMPANY_NAME, bold: true },
      ...COMPANY_ADDRESS_LINES.map((text) => ({ text, bold: false })),
      { text: `UDYAM : ${COMPANY_UDYAM}`, bold: false },
      { text: `GSTIN/UIN: ${COMPANY_GST}`, bold: false },
      { text: `State Name : ${COMPANY_STATE}, Code : ${COMPANY_STATE_CODE}`, bold: false },
      { text: `CIN: ${COMPANY_CIN}`, bold: false },
      { text: `E-Mail : ${COMPANY_EMAIL}`, bold: false },
      { text: ' ', bold: false },
      { text: 'Consignee (Ship to)', bold: true },
      { text: invoice.customer.companyName, bold: true },
      ...shippingLines.map((text) => ({ text, bold: false })),
      { text: `State Name : ${invoice.customer.state ?? '—'}, Code : ${customerStateCode}`, bold: false },
      { text: ' ', bold: false },
      { text: 'Buyer (Bill to)', bold: true },
      { text: invoice.customer.companyName, bold: true },
      ...billingLines.map((text) => ({ text, bold: false })),
      { text: `State Name : ${invoice.customer.state ?? '—'}, Code : ${customerStateCode}`, bold: false },
    ];

    // Right column: the Tally-style metadata grid (Invoice No/Dated,
    // Buyer's Order No, Dispatched through, Mode/Terms of Payment,
    // Destination, Terms of Delivery).
    const rightLines: { text: string; bold: boolean }[] = [
      { text: 'Invoice No.', bold: true },
      { text: invoice.invoiceNumber, bold: true },
      { text: 'Dated', bold: false },
      { text: this.formatDate(invoice.invoiceDate), bold: false },
      { text: " Buyer's Order No.", bold: false },
      { text: invoice.buyersOrderNo?.trim() || 'Verbal', bold: false },
      { text: 'Dispatched through', bold: false },
      { text: invoice.dispatchedThrough?.trim() || 'By Road', bold: false },
      { text: 'Mode/Terms of Payment', bold: false },
      { text: invoice.paymentTerms?.trim() || 'Against Delivery', bold: false },
      { text: 'Destination', bold: false },
      { text: invoice.destination?.trim() || '—', bold: false },
      { text: 'Terms of Delivery', bold: false },
      ...(invoice.termsOfDelivery?.trim()
        ? invoice.termsOfDelivery
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
            .map((text) => ({ text, bold: false }))
        : [{ text: 'Packing: Inclusive, Installation: Inclusive, Freight: Inclusive', bold: false }]),
    ];

    doc.y = this.drawTwoColLines(doc, contentLeft, col1, col2, leftLines, rightLines);

    // Items table — Sl No / Description / HSN-SAC / Quantity / Rate / per / Amount.
    const widths = [
      Math.round(contentWidth * 0.05),
      Math.round(contentWidth * 0.35),
      Math.round(contentWidth * 0.12),
      Math.round(contentWidth * 0.1),
      Math.round(contentWidth * 0.13),
      Math.round(contentWidth * 0.08),
    ];
    widths.push(contentWidth - widths.reduce((a, b) => a + b, 0));

    doc.y = this.drawItemsHeaderRow(doc, contentLeft, widths, [
      'Sl No.',
      'Description of Goods and Services',
      'HSN/SAC',
      'Quantity',
      'Rate',
      'per',
      'Amount',
    ]);

    let cgstTotal = 0;
    let sgstTotal = 0;
    const hsnRows = new Map<string, { taxable: number; tax: number }>();

    invoice.items.forEach((item, index) => {
      const hsnSac = this.resolveHsnSac(item);
      const taxable = Math.max(0, item.quantity * item.unitPrice - item.discount);
      cgstTotal += isIntraState ? item.tax / 2 : 0;
      sgstTotal += isIntraState ? item.tax / 2 : 0;
      const hsnRow = hsnRows.get(hsnSac) ?? { taxable: 0, tax: 0 };
      hsnRow.taxable += taxable;
      hsnRow.tax += item.tax;
      hsnRows.set(hsnSac, hsnRow);

      doc.y = this.drawItemsDataRow(doc, contentLeft, widths, [
        String(index + 1),
        item.description?.trim() || item.product.name,
        hsnSac,
        `${item.quantity} Nos`,
        this.formatNumber(item.unitPrice),
        'Nos',
        this.formatNumber(item.lineTotal - item.tax),
      ]);
    });

    // Output CGST / SGST (intra-state) or IGST (inter-state) summary rows,
    // then the grand Total row — label spans the first six columns, only
    // the Amount column holds a value (same convention as the Proforma
    // Invoice PDF's summary rows).
    const summaryLabelWidth = widths.slice(0, 6).reduce((a, b) => a + b, 0);
    const totalQuantity = invoice.items.reduce((sum, i) => sum + i.quantity, 0);

    doc.y = this.drawSummaryRow(doc, contentLeft, summaryLabelWidth, widths[6], '', this.formatNumber(invoice.subtotal), false);
    if (isIntraState) {
      const avgRate = invoice.subtotal > 0 ? Math.round((cgstTotal / invoice.subtotal) * 10000) / 100 : 0;
      doc.y = this.drawSummaryRow(doc, contentLeft, summaryLabelWidth, widths[6], `Output CGST ${avgRate}%`, this.formatNumber(cgstTotal), false);
      doc.y = this.drawSummaryRow(doc, contentLeft, summaryLabelWidth, widths[6], `Output SGST ${avgRate}%`, this.formatNumber(sgstTotal), false);
    } else {
      const avgRate = invoice.subtotal > 0 ? Math.round((invoice.tax / invoice.subtotal) * 10000) / 100 : 0;
      doc.y = this.drawSummaryRow(doc, contentLeft, summaryLabelWidth, widths[6], `Output IGST ${avgRate}%`, this.formatNumber(invoice.tax), false);
    }
    doc.y = this.drawSummaryRow(
      doc,
      contentLeft,
      summaryLabelWidth,
      widths[6],
      `Total  ${totalQuantity} Nos`,
      `Rs. ${this.formatNumber(invoice.grandTotal)}`,
      true,
    );

    // Amount Chargeable (in words).
    {
      const amountWords = `INR ${this.numberToIndianWords(Math.round(invoice.grandTotal))} Only`;
      const y = doc.y;
      const height = Math.max(doc.heightOfString(amountWords, { width: contentWidth - 12 }), 12) + 10;
      doc.lineWidth(0.75).strokeColor(BORDER).rect(contentLeft, y, contentWidth, height).stroke();
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('black');
      doc.text('Amount Chargeable (in words)', contentLeft + 6, y + 5, { width: contentWidth - 100 });
      doc.font('Helvetica-Oblique').fontSize(8).text('E. & O.E', contentLeft, y + 5, { width: contentWidth - 6, align: 'right' });
      doc.font('Helvetica-Bold').fontSize(9.5).text(amountWords, contentLeft + 6, y + 18, { width: contentWidth - 12 });
      doc.y = y + height;
    }

    // HSN/SAC-wise tax breakdown table.
    const taxWidths = isIntraState
      ? [
          Math.round(contentWidth * 0.22),
          Math.round(contentWidth * 0.2),
          Math.round(contentWidth * 0.12),
          Math.round(contentWidth * 0.14),
          Math.round(contentWidth * 0.12),
          Math.round(contentWidth * 0.14),
        ]
      : [
          Math.round(contentWidth * 0.28),
          Math.round(contentWidth * 0.24),
          Math.round(contentWidth * 0.16),
          Math.round(contentWidth * 0.16),
        ];
    taxWidths.push(contentWidth - taxWidths.reduce((a, b) => a + b, 0));

    const taxHeaderLabels = isIntraState
      ? ['HSN/SAC', 'Taxable Value', 'CGST Rate', 'CGST Amount', 'SGST Rate', 'SGST Amount', 'Total Tax Amount']
      : ['HSN/SAC', 'Taxable Value', 'IGST Rate', 'IGST Amount', 'Total Tax Amount'];
    doc.y = this.drawItemsHeaderRow(doc, contentLeft, taxWidths, taxHeaderLabels);

    let hsnTaxableTotal = 0;
    let hsnTaxTotal = 0;
    for (const [hsnSac, row] of hsnRows.entries()) {
      hsnTaxableTotal += row.taxable;
      hsnTaxTotal += row.tax;
      const rate = row.taxable > 0 ? Math.round((row.tax / row.taxable) * 10000) / 100 : 0;
      const values = isIntraState
        ? [
            hsnSac,
            this.formatNumber(row.taxable),
            `${rate / 2}%`,
            this.formatNumber(row.tax / 2),
            `${rate / 2}%`,
            this.formatNumber(row.tax / 2),
            this.formatNumber(row.tax),
          ]
        : [hsnSac, this.formatNumber(row.taxable), `${rate}%`, this.formatNumber(row.tax), this.formatNumber(row.tax)];
      doc.y = this.drawItemsDataRow(doc, contentLeft, taxWidths, values);
    }
    {
      const totalValues = isIntraState
        ? ['Total', this.formatNumber(hsnTaxableTotal), '', this.formatNumber(hsnTaxTotal / 2), '', this.formatNumber(hsnTaxTotal / 2), this.formatNumber(hsnTaxTotal)]
        : ['Total', this.formatNumber(hsnTaxableTotal), '', this.formatNumber(hsnTaxTotal), this.formatNumber(hsnTaxTotal)];
      doc.y = this.drawItemsDataRow(doc, contentLeft, taxWidths, totalValues);
    }

    // Tax Amount (in words).
    doc.font('Helvetica-Bold').fontSize(9).fillColor('black');
    doc.text(`Tax Amount (in words) : INR ${this.numberToIndianWords(Math.round(hsnTaxTotal))} Only`, contentLeft, doc.y + 4, {
      width: contentWidth,
    });
    doc.moveDown(0.6);

    // Bottom section: PAN + Declaration (left) | Bank details + Signatory (right).
    const bottomY = doc.y;
    doc.font('Helvetica-Bold').fontSize(9).text(`Company's PAN : ${COMPANY_PAN}`, contentLeft, bottomY);
    doc.font('Helvetica-Bold').fontSize(9).text('Declaration', contentLeft, doc.y + 6);
    doc.font('Helvetica').fontSize(8);
    doc.text(
      'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
      contentLeft,
      doc.y,
      { width: col1 - 10 },
    );
    const leftBottomEndY = doc.y;

    const rightX = contentLeft + col1;
    doc.font('Helvetica-Bold').fontSize(9).text("Company's Bank Details", rightX, bottomY);
    doc.font('Helvetica').fontSize(8.5);
    doc.text(`A/c Holder's Name : ${COMPANY_NAME}`, rightX, doc.y + 2, { width: col2 });
    doc.font('Helvetica-Bold');
    doc.text(`Bank Name : ${DEFAULT_BANK_NAME}`, rightX, doc.y, { width: col2 });
    doc.text(`A/c No. : ${DEFAULT_ACCOUNT_NUMBER}`, rightX, doc.y, { width: col2 });
    doc.text(`Branch & IFS Code : ${DEFAULT_BRANCH} & ${DEFAULT_IFSC}`, rightX, doc.y, { width: col2 });
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text(`for ${COMPANY_NAME}`, rightX, doc.y, { width: col2, align: 'right' });
    doc.moveDown(2);
    doc.text('Authorised Signatory', rightX, doc.y, { width: col2, align: 'right' });

    doc.y = Math.max(leftBottomEndY, doc.y) + 10;

    doc.font('Helvetica').fontSize(8).fillColor('black');
    doc.text('SUBJECT TO HYDERABAD JURISDICTION', contentLeft, doc.y, { width: contentWidth, align: 'center' });
    doc.font('Helvetica-Oblique').fontSize(7.5);
    doc.text('This is a Computer Generated Invoice', contentLeft, doc.y + 2, { width: contentWidth, align: 'center' });
  }

  // ---- Row helpers (all take/return explicit y coordinates) -------------

  private drawTwoColLines(
    doc: PDFKit.PDFDocument,
    contentLeft: number,
    col1: number,
    col2: number,
    leftLines: { text: string; bold: boolean }[],
    rightLines: { text: string; bold: boolean }[],
  ): number {
    const y = doc.y;
    const lineHeight = 12;
    const leftHeight = Math.max(leftLines.length, 1) * lineHeight;
    const rightHeight = Math.max(rightLines.length, 1) * lineHeight;
    const height = Math.max(leftHeight, rightHeight) + 10;

    doc.lineWidth(0.75).strokeColor(BORDER);
    doc.rect(contentLeft, y, col1, height).stroke();
    doc.rect(contentLeft + col1, y, col2, height).stroke();

    doc.fontSize(9).fillColor('black');
    leftLines.forEach((line, i) => {
      doc.font(line.bold ? 'Helvetica-Bold' : 'Helvetica');
      doc.text(line.text, contentLeft + 6, y + 5 + i * lineHeight, { width: col1 - 12 });
    });
    rightLines.forEach((line, i) => {
      doc.font(line.bold ? 'Helvetica-Bold' : 'Helvetica');
      doc.text(line.text, contentLeft + col1 + 6, y + 5 + i * lineHeight, { width: col2 - 12 });
    });

    return y + height;
  }

  private drawItemsHeaderRow(doc: PDFKit.PDFDocument, contentLeft: number, widths: number[], labels: string[]): number {
    const y = doc.y;
    const height = 20;
    let x = contentLeft;
    doc.lineWidth(0.75).strokeColor(BORDER);
    doc.font('Helvetica-Bold').fontSize(8);
    labels.forEach((label, i) => {
      doc.rect(x, y, widths[i], height).fillAndStroke('#eef2f7', BORDER);
      doc.fillColor('black').text(label, x + 3, y + 6, { width: widths[i] - 6, align: i >= 2 ? 'center' : 'left' });
      x += widths[i];
    });
    return y + height;
  }

  private drawItemsDataRow(doc: PDFKit.PDFDocument, contentLeft: number, widths: number[], values: string[]): number {
    const y = doc.y;
    doc.font('Helvetica').fontSize(8.5);
    const height = Math.max(...values.map((v, i) => doc.heightOfString(v, { width: widths[i] - 6 }))) + 10;
    let x = contentLeft;
    doc.lineWidth(0.75).strokeColor(BORDER).fillColor('black');
    values.forEach((value, i) => {
      doc.rect(x, y, widths[i], height).stroke();
      doc.text(value, x + 3, y + 5, { width: widths[i] - 6, align: i >= 2 ? 'center' : 'left' });
      x += widths[i];
    });
    return y + height;
  }

  private drawSummaryRow(
    doc: PDFKit.PDFDocument,
    contentLeft: number,
    labelWidth: number,
    valueWidth: number,
    label: string,
    value: string,
    shaded: boolean,
  ): number {
    const y = doc.y;
    const height = 18;
    doc.lineWidth(0.75).strokeColor(BORDER);
    doc.rect(contentLeft, y, labelWidth, height).stroke();
    if (shaded) {
      doc.rect(contentLeft + labelWidth, y, valueWidth, height).fillAndStroke('#d9d9d9', BORDER);
    } else {
      doc.rect(contentLeft + labelWidth, y, valueWidth, height).stroke();
    }
    doc.font('Helvetica-Bold').fontSize(9).fillColor('black');
    doc.text(label, contentLeft + 6, y + 4, { width: labelWidth - 12, align: 'right' });
    doc.text(value, contentLeft + labelWidth, y + 4, { width: valueWidth - 6, align: 'center' });
    return y + height;
  }

  private safeImage(doc: PDFKit.PDFDocument, filePath: string, x: number, y: number, options: PDFKit.Mixins.ImageOption): void {
    try {
      if (fs.existsSync(filePath)) {
        doc.image(filePath, x, y, options);
      }
    } catch (error) {
      this.logger.warn(`Could not embed image ${filePath}: ${error instanceof Error ? error.message : error}`);
    }
  }

  // ---- Domain helpers -----------------------------------------------------

  private resolveHsnSac(item: TaxInvoicePdfItem): string {
    const label = `${item.description ?? ''} ${item.product.name}`.toLowerCase();
    return label.includes('install') ? SAC_INSTALLATION : HSN_CODE_FAN;
  }

  private splitAddress(address?: string | null): string[] {
    return (address ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  }

  // ---- Formatting ---------------------------------------------------------

  private formatNumber(value: number): string {
    return Math.round(value).toLocaleString('en-IN');
  }

  private formatDate(date: Date): string {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${date.getDate()}-${months[date.getMonth()]}-${String(date.getFullYear()).slice(-2)}`;
  }

  // Indian numbering system (lakh/crore) number-to-words — same
  // self-contained converter already used in proforma-invoice-pdf.service.ts
  // (duplicated rather than imported, per this file's own convention above).
  private numberToIndianWords(value: number): string {
    if (value <= 0) return 'Zero';
    const ones = [
      '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
      'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
    ];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const twoDigits = (n: number): string => {
      if (n < 20) return ones[n];
      return `${tens[Math.floor(n / 10)]}${n % 10 ? ' ' + ones[n % 10] : ''}`;
    };
    const threeDigits = (n: number): string => {
      if (n < 100) return twoDigits(n);
      const rest = n % 100;
      return `${ones[Math.floor(n / 100)]} Hundred${rest ? ' ' + twoDigits(rest) : ''}`;
    };

    let n = Math.round(value);
    const crore = Math.floor(n / 10000000);
    n %= 10000000;
    const lakh = Math.floor(n / 100000);
    n %= 100000;
    const thousand = Math.floor(n / 1000);
    n %= 1000;
    const hundred = n;

    const parts: string[] = [];
    if (crore) parts.push(`${threeDigits(crore)} Crore`);
    if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
    if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
    if (hundred) parts.push(threeDigits(hundred));

    return parts.join(' ');
  }
}
