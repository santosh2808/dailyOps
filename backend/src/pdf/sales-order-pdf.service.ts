import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import PDFDocument = require('pdfkit');

// Branded Sales Order PDF — QA fix ("Sales Order -> Customer Email: after
// confirmation, the customer email is sent without the Sales Order
// PDF/attachment and important details like items, shipping address, and
// delivery date. Also, there is no View PDF option in the Sales Order
// within the application."). Unlike Quotation/ProformaInvoice/TaxInvoice/
// JobExecutionOrder, Sales Order never had a dedicated PDF service at all —
// this is a genuine gap, not a wiring bug (confirmed: no reference template
// was ever supplied for this document, unlike the other four). Built to
// match this project's existing house style (same logo/title-bar/two-col-
// header-row/items-table/summary-row/footer primitives as
// proforma-invoice-pdf.service.ts) rather than inventing a new look, since
// no customer-supplied template exists to replicate exactly for this one.
// Same "one file per branded template, no cross-file coupling" convention
// as every other file in this directory — company/bank constants are
// deliberately duplicated rather than shared.
export interface SalesOrderPdfCustomer {
  companyName: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  gstNumber?: string | null;
  // GST split (CGST+SGST vs IGST) — same intra/inter-state rule as every
  // other branded PDF in this directory (see COMPANY_STATE below).
  state?: string | null;
}

export interface SalesOrderPdfItem {
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  description?: string | null;
  product: { name: string };
}

export interface SalesOrderPdfInput {
  salesOrderNumber: string;
  orderDate: Date;
  deliveryDate?: Date | null;
  status: string;
  quotationNumber: string;
  customer: SalesOrderPdfCustomer;
  billingAddress?: string | null;
  shippingAddress?: string | null;
  customerPoNumber?: string | null;
  items: SalesOrderPdfItem[];
  subtotal: number;
  installationCharge: number;
  transportationCharge: number;
  taxPercent: number;
  tax: number;
  grandTotal: number;
  paymentTerms?: string | null;
  specialInstructions?: string | null;
  remarks?: string | null;
}

const ASSETS_DIR = path.join(__dirname, 'assets');
const LOGO_SR = path.join(ASSETS_DIR, 'logo-smart-rotamach.jpg');

const PAGE_MARGIN = 45;
const GREEN = '#4b8f29';
const BORDER = '#334155';

const COMPANY_NAME = 'SMART ROTAMACH PRIVATE LIMITED';
const COMPANY_ADDRESS_LINES = ['# 6-2-982, 3rd Floor, GNR Arcade,', 'Khairatabad, Hyderabad-500004.'];
const COMPANY_ADDRESS = '# 6-2-982, 3rd Floor, GNR Arcade, Khairatabad, Hyderabad-500004, Telangana, India.';
const COMPANY_CONTACT_LINE = 'Sales Ph: 9949465932; Email : info@spyrofan.com; www.spyrofan.com';
// Same company-wide GSTIN constant as proforma-invoice-pdf.service.ts /
// tax-invoice-pdf.service.ts / quotation-pdf.service.ts.
const COMPANY_GST = '36ABECS1637F1ZG';
const COMPANY_STATE = 'Telangana';

@Injectable()
export class SalesOrderPdfService {
  private readonly logger = new Logger(SalesOrderPdfService.name);

  render(order: SalesOrderPdfInput): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      try {
        this.draw(doc, order);
      } catch (error) {
        this.logger.error('Sales Order PDF rendering failed', error instanceof Error ? error.stack : error);
        reject(error);
        return;
      }

      doc.end();
    });
  }

  private draw(doc: PDFKit.PDFDocument, order: SalesOrderPdfInput): void {
    const contentLeft = PAGE_MARGIN;
    const contentWidth = doc.page.width - PAGE_MARGIN * 2;
    const col1 = Math.round(contentWidth * 0.5);
    const col2 = contentWidth - col1;

    this.safeImage(doc, LOGO_SR, contentLeft, doc.y, { height: 42 });
    doc.y += 52;

    // Title bar.
    const titleHeight = 26;
    doc.lineWidth(1).strokeColor(BORDER).rect(contentLeft, doc.y, contentWidth, titleHeight).stroke();
    doc.font('Helvetica-Bold').fontSize(15).fillColor('black');
    doc.text('SALES ORDER', contentLeft, doc.y + 6, { width: contentWidth, align: 'center' });
    doc.y += titleHeight;

    // Order No. / Date / Delivery Date row.
    doc.y = this.drawTwoColLines(
      doc,
      contentLeft,
      col1,
      col2,
      [
        { text: `Sales Order No: ${order.salesOrderNumber}`, bold: true },
        { text: `Quotation Ref: ${order.quotationNumber}`, bold: false },
      ],
      [
        { text: `Order Date: ${this.formatDate(order.orderDate)}`, bold: true },
        {
          text: `Delivery Date: ${order.deliveryDate ? this.formatDate(order.deliveryDate) : '—'}`,
          bold: true,
        },
        { text: `Status: ${order.status}`, bold: false },
      ],
    );

    // Billing address / From block.
    const billingLines = (order.billingAddress ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const contactLine = order.customer.contactPerson
      ? `Contact : ${order.customer.contactPerson}${order.customer.phone ? `; ${order.customer.phone}` : ''}`
      : null;
    const billToLines = [
      { text: 'Bill To :', bold: true },
      { text: `M/s. ${order.customer.companyName},`, bold: false },
      ...billingLines.map((text) => ({ text, bold: false })),
      ...(contactLine ? [{ text: contactLine, bold: false }] : []),
    ];
    const fromLines = [
      { text: 'From :', bold: true },
      { text: COMPANY_NAME, bold: true },
      ...COMPANY_ADDRESS_LINES.map((text) => ({ text, bold: true })),
    ];
    doc.y = this.drawTwoColLines(doc, contentLeft, col1, col2, billToLines, fromLines);

    // Shipping address / PO Number row.
    const shippingLines = (order.shippingAddress ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const shipToLines = [
      { text: 'Ship To :', bold: true },
      ...(shippingLines.length ? shippingLines.map((text) => ({ text, bold: false })) : [{ text: '—', bold: false }]),
    ];
    const poLines = [
      { text: `P.O. No: ${order.customerPoNumber?.trim() || '—'}`, bold: true },
      { text: `GSTIN: ${order.customer.gstNumber?.trim() || '—'}`, bold: false },
      { text: `GST : ${COMPANY_GST}`, bold: false },
    ];
    doc.y = this.drawTwoColLines(doc, contentLeft, col1, col2, shipToLines, poLines);

    // Items table.
    const widths = [
      Math.round(contentWidth * 0.07),
      Math.round(contentWidth * 0.45),
      Math.round(contentWidth * 0.15),
      Math.round(contentWidth * 0.16),
    ];
    widths.push(contentWidth - widths.reduce((a, b) => a + b, 0));
    doc.y = this.drawItemsHeaderRow(doc, contentLeft, widths, ['S.No.', 'Description', 'Quantity', 'Unit Rate', 'Total']);
    for (const [index, item] of order.items.entries()) {
      doc.y = this.drawItemsDataRow(doc, contentLeft, widths, [
        String(index + 1),
        item.description?.trim() || item.product.name,
        `${item.quantity} Nos.`,
        this.formatNumber(item.unitPrice),
        this.formatNumber(item.lineTotal),
      ]);
    }

    // Summary rows — label cell spans the first four item-table columns
    // merged (same convention as proforma-invoice-pdf.service.ts), only the
    // Total column holds the amount.
    const summaryLabelWidth = widths[0] + widths[1] + widths[2] + widths[3];
    const isIntra = this.isIntraState(order);
    const gstSummaryRows: [string, string][] = isIntra
      ? [
          [`CGST ${order.taxPercent / 2}%`, this.formatNumber(order.tax / 2)],
          [`SGST ${order.taxPercent / 2}%`, this.formatNumber(order.tax / 2)],
        ]
      : [[`IGST ${order.taxPercent}%`, this.formatNumber(order.tax)]];
    const chargeRows: [string, string][] = [
      ...(order.installationCharge > 0 ? [['Installation Charge', this.formatNumber(order.installationCharge)] as [string, string]] : []),
      ...(order.transportationCharge > 0
        ? [['Transportation Charge', this.formatNumber(order.transportationCharge)] as [string, string]]
        : []),
    ];
    const summaryRows: [string, string, boolean][] = [
      ['Subtotal', this.formatNumber(order.subtotal), false],
      ...chargeRows.map(([l, v]): [string, string, boolean] => [l, v, false]),
      ...gstSummaryRows.map(([l, v]): [string, string, boolean] => [l, v, false]),
      ['Grand Total', this.formatNumber(order.grandTotal), true],
    ];
    for (const [label, value, shaded] of summaryRows) {
      doc.y = this.drawSummaryRow(doc, contentLeft, summaryLabelWidth, widths[4], label, value, shaded);
    }

    doc.moveDown(1.2);

    if (order.paymentTerms && order.paymentTerms.trim()) {
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('black').text('Payment Terms:', contentLeft, doc.y);
      doc.font('Helvetica').text(order.paymentTerms.trim(), contentLeft, doc.y, { width: contentWidth });
      doc.moveDown(0.6);
    }
    if (order.specialInstructions && order.specialInstructions.trim()) {
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('black').text('Special Instructions:', contentLeft, doc.y);
      doc.font('Helvetica').text(order.specialInstructions.trim(), contentLeft, doc.y, { width: contentWidth });
      doc.moveDown(0.6);
    }
    if (order.remarks && order.remarks.trim()) {
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('black').text('Remarks:', contentLeft, doc.y);
      doc.font('Helvetica').text(order.remarks.trim(), contentLeft, doc.y, { width: contentWidth });
    }

    doc.moveDown(1.5);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('black');
    doc.text(`For ${COMPANY_NAME}`, contentLeft, doc.y, { width: contentWidth, align: 'right' });
    doc.moveDown(2.5);
    doc.text('AUTHORISED SIGNATORY', contentLeft, doc.y, { width: contentWidth, align: 'right' });

    this.drawFooter(doc);
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

  // ---- GST split (CGST+SGST vs IGST) --------------------------------------

  private isIntraState(order: SalesOrderPdfInput): boolean {
    return (order.customer.state ?? '').trim() === COMPANY_STATE;
  }

  // ---- Formatting ---------------------------------------------------------

  private formatNumber(value: number): string {
    return Math.round(value).toLocaleString('en-IN');
  }

  private formatDate(date: Date): string {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }
}
