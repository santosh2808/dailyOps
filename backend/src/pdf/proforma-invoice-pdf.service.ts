import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import PDFDocument = require('pdfkit');

// Branded Proforma Invoice PDF — an exact reproduction of the customer-
// supplied reference template ("Proforma Invoice 001.doc"). Self-contained
// (does not import from quotation-pdf.service.ts) — same "one file per
// branded template, no cross-file coupling" convention already established
// there, even though a few constants (company name/address/bank details)
// are deliberately duplicated rather than shared. Every row is drawn with
// explicit x/y coordinates computed up front (never by mutating doc.x/
// doc.y inside a callback) — the same approach quotation-pdf.service.ts
// uses, since pdfkit's own text-flow cursor is easy to get out of sync
// with hand-drawn table borders otherwise.
export interface ProformaInvoicePdfCustomer {
  companyName: string;
  contactPerson?: string | null;
  phone?: string | null;
  gstNumber?: string | null;
}

export interface ProformaInvoicePdfItem {
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  description?: string | null;
  product: { name: string };
}

export interface ProformaInvoicePdfInput {
  invoiceNumber: string;
  invoiceDate: Date;
  customer: ProformaInvoicePdfCustomer;
  // Free-text, multi-line (see SalesOrder.billingAddress) — split on
  // newlines and rendered as-is under the customer's company name. There
  // is no structured postal-address field on Customer itself (see
  // schema.prisma), so this is the only source for the "M/s. ..." block
  // the template shows.
  billingAddress?: string | null;
  items: ProformaInvoicePdfItem[];
  subtotal: number;
  taxPercent: number;
  tax: number;
  grandTotal: number;
  advanceReceived: number;
  paymentTerms?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  ifscCode?: string | null;
  branch?: string | null;
  notes?: string | null;
}

const ASSETS_DIR = path.join(__dirname, 'assets');
const LOGO_SR = path.join(ASSETS_DIR, 'logo-smart-rotamach.jpg');

const PAGE_MARGIN = 45;
const GREEN = '#4b8f29';
const BORDER = '#334155';
const RED = '#c00000';

const COMPANY_NAME = 'SMART ROTAMACH PRIVATE LIMITED';
const COMPANY_ADDRESS_LINES = ['# 6-2-982, 3rd Floor, GNR Arcade,', 'Khairatabad, Hyderabad-500004.'];
const COMPANY_ADDRESS = '# 6-2-982, 3rd Floor, GNR Arcade, Khairatabad, Hyderabad-500004, Telangana, India.';
const COMPANY_CONTACT_LINE = 'Sales Ph: 9949465932; Email : info@spyrofan.com; www.spyrofan.com';
// Smart Rotamach's own GSTIN — a company-wide constant (this legal entity
// has exactly one GST registration), distinct from the customer's own
// gstNumber shown alongside it. Not modeled anywhere in the schema since
// nothing else needed it before this PDF.
const COMPANY_GST = '36ABECS1637F1ZG';
// Fans (HSN 84145990) are the only product category this app sells today —
// a single constant rather than a new Product field. If a non-fan product
// with a different HSN code is ever added, this should move onto Product
// itself instead of staying a global constant.
const HSN_CODE_FANS = '84145990';

// Same banker details already used on the Quotation PDF's Annexure-II
// (see quotation-pdf.service.ts) — duplicated rather than imported, per
// this file's own "no cross-file coupling" convention above. Used only as
// a fallback when this specific invoice didn't have its own bank details
// entered (see ProformaInvoicesService.create()).
const DEFAULT_BANK_NAME = 'ICICI BANK LIMITED';
const DEFAULT_ACCOUNT_NUMBER = '007605007585';
const DEFAULT_BRANCH = 'Jubilee Hills';
const DEFAULT_IFSC = 'ICIC0000076';

@Injectable()
export class ProformaInvoicePdfService {
  private readonly logger = new Logger(ProformaInvoicePdfService.name);

  render(invoice: ProformaInvoicePdfInput): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      try {
        this.draw(doc, invoice);
      } catch (error) {
        this.logger.error('Proforma Invoice PDF rendering failed', error instanceof Error ? error.stack : error);
        reject(error);
        return;
      }

      doc.end();
    });
  }

  private draw(doc: PDFKit.PDFDocument, invoice: ProformaInvoicePdfInput): void {
    const contentLeft = PAGE_MARGIN;
    const contentWidth = doc.page.width - PAGE_MARGIN * 2;
    const col1 = Math.round(contentWidth * 0.55);
    const col2 = contentWidth - col1;

    this.safeImage(doc, LOGO_SR, contentLeft, doc.y, { height: 42 });
    doc.y += 52;

    // Title bar.
    const titleHeight = 26;
    doc.lineWidth(1).strokeColor(BORDER).rect(contentLeft, doc.y, contentWidth, titleHeight).stroke();
    doc.font('Helvetica-Bold').fontSize(15).fillColor('black');
    doc.text('PROFORMA INVOICE', contentLeft, doc.y + 6, { width: contentWidth, align: 'center' });
    doc.y += titleHeight;

    // Ref No. / Date row.
    doc.y = this.drawTwoColLines(
      doc,
      contentLeft,
      col1,
      col2,
      [{ text: `Ref. No: ${invoice.invoiceNumber}`, bold: true }],
      [{ text: `Dt: ${this.formatDate(invoice.invoiceDate)}`, bold: true }],
    );

    // Customer block / From block.
    const billingLines = (invoice.billingAddress ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const contactLine = invoice.customer.contactPerson
      ? `Contact : ${invoice.customer.contactPerson}${invoice.customer.phone ? `; ${invoice.customer.phone}` : ''}`
      : null;
    const leftLines = [
      { text: `M/s. ${invoice.customer.companyName},`, bold: false },
      ...billingLines.map((text) => ({ text, bold: false })),
      ...(contactLine ? [{ text: contactLine, bold: false }] : []),
    ];
    const rightLines = [
      { text: 'From :', bold: true },
      { text: COMPANY_NAME, bold: true },
      ...COMPANY_ADDRESS_LINES.map((text) => ({ text, bold: true })),
    ];
    doc.y = this.drawTwoColLines(doc, contentLeft, col1, col2, leftLines, rightLines);

    // P.O. No. row (no source of truth yet — see the module comment above;
    // always blank on the right until a PO field exists somewhere upstream).
    doc.y = this.drawTwoColLines(
      doc,
      contentLeft,
      col1,
      col2,
      [{ text: 'P.O.No:', bold: true }],
      [{ text: '', bold: false }],
    );

    // GSTIN row.
    doc.y = this.drawTwoColLines(
      doc,
      contentLeft,
      col1,
      col2,
      [{ text: `GSTIN: ${invoice.customer.gstNumber?.trim() || '—'}`, bold: true }],
      [{ text: `GST : ${COMPANY_GST}`, bold: true }],
    );

    // HSN code row (single, full width, red).
    {
      const y = doc.y;
      const height = 22;
      doc.lineWidth(0.75).strokeColor(BORDER).rect(contentLeft, y, contentWidth, height).stroke();
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(RED);
      doc.text(`HSN CODE : ${HSN_CODE_FANS}`, contentLeft + 6, y + 6);
      doc.fillColor('black');
      doc.y = y + height;
    }

    // Items table.
    const widths = [
      Math.round(contentWidth * 0.07),
      Math.round(contentWidth * 0.48),
      Math.round(contentWidth * 0.15),
      Math.round(contentWidth * 0.15),
    ];
    widths.push(contentWidth - widths.reduce((a, b) => a + b, 0));
    doc.y = this.drawItemsHeaderRow(doc, contentLeft, widths, ['S.No.', 'Description', 'Quantity', 'Unit Rate', 'Total']);
    for (const [index, item] of invoice.items.entries()) {
      doc.y = this.drawItemsDataRow(doc, contentLeft, widths, [
        String(index + 1),
        item.description?.trim() || item.product.name,
        `${item.quantity} Nos.`,
        this.formatNumber(item.unitPrice),
        this.formatNumber(item.lineTotal),
      ]);
    }

    // Label cell spans the first four item-table columns (S.No/Description/
    // Quantity/Unit Rate merged) with only the Total column holding the
    // amount — matching the reference template, where "Advance received" /
    // "Grand Total" etc. need far more than one narrow column's width to
    // fit on a single line.
    const receivable = Math.max(invoice.grandTotal - invoice.advanceReceived, 0);
    const summaryLabelWidth = widths[0] + widths[1] + widths[2] + widths[3];
    const summaryRows: [string, string, boolean][] = [
      ['Total', this.formatNumber(invoice.subtotal), false],
      [`GST ${invoice.taxPercent}%`, this.formatNumber(invoice.tax), false],
      ['Grand Total', this.formatNumber(invoice.grandTotal), false],
      ['Advance received', this.formatNumber(invoice.advanceReceived), true],
      ['Receivable', this.formatNumber(receivable), true],
    ];
    for (const [label, value, shaded] of summaryRows) {
      doc.y = this.drawSummaryRow(doc, contentLeft, summaryLabelWidth, widths[4], label, value, shaded);
    }

    // Amount-in-words row — describes the Receivable amount (matches the
    // reference template, where the highlighted words line is the balance
    // still owed, not the grand total).
    {
      const amountWords = `Rupees ${this.numberToIndianWords(Math.round(receivable))} only.`;
      const wordsWidth = contentWidth - widths[0];
      const y = doc.y;
      const height = Math.max(doc.heightOfString(amountWords, { width: wordsWidth - 12 }), 12) + 10;
      doc.lineWidth(0.75).strokeColor(BORDER);
      doc.rect(contentLeft, y, widths[0], height).stroke();
      doc.rect(contentLeft + widths[0], y, wordsWidth, height).fillAndStroke('#fff2a8', BORDER);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('black');
      doc.text(amountWords, contentLeft + widths[0] + 6, y + 5, { width: wordsWidth - 12, align: 'center' });
      doc.y = y + height;
    }

    doc.moveDown(1.2);

    // Banker details.
    doc.font('Helvetica').fontSize(9.5).fillColor('black');
    doc.text('Our Banker Details :', contentLeft, doc.y);
    doc.font('Helvetica-Bold').fontSize(10.5);
    doc.text(`Bank : ${invoice.bankName?.trim() || DEFAULT_BANK_NAME},`, contentLeft, doc.y, { underline: true });
    doc.text(`Account No: ${invoice.accountNumber?.trim() || DEFAULT_ACCOUNT_NUMBER}`, contentLeft, doc.y, { underline: true });
    doc.text(`Branch : ${invoice.branch?.trim() || DEFAULT_BRANCH}`, contentLeft, doc.y, { underline: true });
    doc.text(`IFSC : ${invoice.ifscCode?.trim() || DEFAULT_IFSC}`, contentLeft, doc.y, { underline: true });

    if (invoice.paymentTerms && invoice.paymentTerms.trim()) {
      doc.moveDown(0.6);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('black').text('Payment Terms:', contentLeft, doc.y);
      doc.font('Helvetica').text(invoice.paymentTerms.trim(), contentLeft, doc.y, { width: contentWidth });
    }
    if (invoice.notes && invoice.notes.trim()) {
      doc.moveDown(0.6);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('black').text('Notes:', contentLeft, doc.y);
      doc.font('Helvetica').text(invoice.notes.trim(), contentLeft, doc.y, { width: contentWidth });
    }

    doc.moveDown(1.5);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('black');
    doc.text(`For ${COMPANY_NAME}`, contentLeft, doc.y, { width: contentWidth, align: 'right' });
    doc.moveDown(2.5);
    doc.text('AUTHORISED SIGNATORY', contentLeft, doc.y, { width: contentWidth, align: 'right' });

    this.drawFooter(doc);
  }

  // ---- Row helpers (all take/return explicit y coordinates) -------------

  // Draws a two-column bordered row from pre-split lines on each side —
  // used for every "label block | label block" row in the header table
  // (Ref/Date, Customer/From, P.O./blank, GSTIN/GST). Returns the y
  // coordinate immediately below the row.
  private drawTwoColLines(
    doc: PDFKit.PDFDocument,
    contentLeft: number,
    col1: number,
    col2: number,
    leftLines: { text: string; bold: boolean }[],
    rightLines: { text: string; bold: boolean }[],
  ): number {
    const y = doc.y;
    const lineHeight = 13;
    const leftHeight = Math.max(leftLines.length, 1) * lineHeight;
    const rightHeight = Math.max(rightLines.length, 1) * lineHeight;
    const height = Math.max(leftHeight, rightHeight) + 10;

    doc.lineWidth(0.75).strokeColor(BORDER);
    doc.rect(contentLeft, y, col1, height).stroke();
    doc.rect(contentLeft + col1, y, col2, height).stroke();

    doc.fontSize(10).fillColor('black');
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
    const height = 22;
    let x = contentLeft;
    doc.lineWidth(0.75).strokeColor(BORDER);
    doc.font('Helvetica-Bold').fontSize(9.5);
    labels.forEach((label, i) => {
      doc.rect(x, y, widths[i], height).fillAndStroke('#eef2f7', BORDER);
      doc.fillColor('black').text(label, x + 4, y + 6, { width: widths[i] - 8, align: i >= 2 ? 'center' : 'left' });
      x += widths[i];
    });
    return y + height;
  }

  private drawItemsDataRow(doc: PDFKit.PDFDocument, contentLeft: number, widths: number[], values: string[]): number {
    const y = doc.y;
    doc.font('Helvetica').fontSize(9.5);
    const height = Math.max(...values.map((v, i) => doc.heightOfString(v, { width: widths[i] - 8 }))) + 12;
    let x = contentLeft;
    doc.lineWidth(0.75).strokeColor(BORDER).fillColor('black');
    values.forEach((value, i) => {
      doc.rect(x, y, widths[i], height).stroke();
      doc.text(value, x + 4, y + 6, { width: widths[i] - 8, align: i >= 2 ? 'center' : 'left' });
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
    const height = 20;
    doc.lineWidth(0.75).strokeColor(BORDER);
    doc.rect(contentLeft, y, labelWidth, height).stroke();
    if (shaded) {
      doc.rect(contentLeft + labelWidth, y, valueWidth, height).fillAndStroke('#d9d9d9', BORDER);
    } else {
      doc.rect(contentLeft + labelWidth, y, valueWidth, height).stroke();
    }
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('black');
    doc.text(label, contentLeft, y + 5, { width: labelWidth - 10, align: 'right' });
    doc.text(value, contentLeft + labelWidth, y + 5, { width: valueWidth - 8, align: 'center' });
    return y + height;
  }

  // ---- Header / Footer ---------------------------------------------------

  private drawFooter(doc: PDFKit.PDFDocument): void {
    const contentLeft = PAGE_MARGIN;
    const contentWidth = doc.page.width - PAGE_MARGIN * 2;
    const y = doc.page.height - PAGE_MARGIN - 32;

    doc.moveTo(contentLeft, y - 6).lineTo(contentLeft + contentWidth, y - 6).strokeColor('#94a3b8').stroke();
    doc.font('Helvetica-Bold').fontSize(9).fillColor(GREEN).text(COMPANY_NAME, contentLeft, y, { width: contentWidth, align: 'center' });
    doc.font('Helvetica').fontSize(7).fillColor('black');
    doc.text(COMPANY_ADDRESS, contentLeft, doc.y, { width: contentWidth, align: 'center' });
    doc.text(COMPANY_CONTACT_LINE, contentLeft, doc.y, { width: contentWidth, align: 'center' });
    doc.fillColor('black');
  }

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
        this.logger.warn(`Image not found, skipping: ${filePath}`);
      }
    } catch (error) {
      this.logger.warn(`Could not embed image ${filePath}: ${error instanceof Error ? error.message : error}`);
    }
  }

  // ---- Formatting ---------------------------------------------------------

  private formatNumber(value: number): string {
    return Math.round(value).toLocaleString('en-IN');
  }

  private formatDate(date: Date): string {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }

  // Indian numbering system (lakh/crore) number-to-words, for the "Rupees
  // ... only." line — no npm package for this was already a dependency, so
  // this is a small self-contained converter (same "no new dependency for
  // a small self-contained need" convention already used elsewhere in this
  // codebase, e.g. sanitizeText() in QuotationsService). Whole rupees
  // only — this PDF never shows paise.
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
