import { Injectable } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import PDFDocument = require('pdfkit');

export interface PdfLineItem {
  name: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface PdfDocumentInput {
  documentTitle: string;
  documentNumber: string;
  documentDate: Date;
  customerName: string;
  customerContact?: string | null;
  customerAddressLines?: string[];
  items: PdfLineItem[];
  subtotal: number;
  discount?: number;
  taxLabel?: string;
  tax: number;
  grandTotal: number;
  fields?: { label: string; value: string }[];
  notes?: string | null;
}

// Generic, functional (not yet branded) PDF renderer shared by Quotation,
// Proforma Invoice, and JEO generation — "Generate PDF" (requirements #6,
// #12, #13). Deliberately a single reusable layout rather than three
// hand-copied ones, so a future branding pass (Smart Rotamac letterhead,
// logo, etc.) only has to touch one place. Returns a Buffer — callers
// either stream it back over HTTP or hand it to MailerService as an email
// attachment.
@Injectable()
export class PdfService {
  render(input: PdfDocumentInput): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(18).text(input.documentTitle, { align: 'center' });
      doc.moveDown(0.5);
      doc
        .fontSize(10)
        .text(`Document No: ${input.documentNumber}`, { continued: false })
        .text(`Date: ${input.documentDate.toLocaleDateString()}`);
      doc.moveDown();

      doc.fontSize(12).text('Customer', { underline: true });
      doc.fontSize(10).text(input.customerName);
      if (input.customerContact) doc.text(input.customerContact);
      for (const line of input.customerAddressLines ?? []) doc.text(line);
      doc.moveDown();

      if (input.fields && input.fields.length > 0) {
        doc.fontSize(12).text('Details', { underline: true });
        doc.fontSize(10);
        for (const field of input.fields) {
          doc.text(`${field.label}: ${field.value}`);
        }
        doc.moveDown();
      }

      doc.fontSize(12).text('Items', { underline: true });
      doc.moveDown(0.25);
      const tableTop = doc.y;
      doc.fontSize(10);
      doc.text('Product', 50, tableTop, { width: 220 });
      doc.text('Qty', 280, tableTop, { width: 50, align: 'right' });
      doc.text('Unit Price', 340, tableTop, { width: 90, align: 'right' });
      doc.text('Line Total', 440, tableTop, { width: 90, align: 'right' });
      doc.moveDown();
      doc.moveTo(50, doc.y).lineTo(530, doc.y).stroke();
      doc.moveDown(0.5);

      for (const item of input.items) {
        const rowTop = doc.y;
        doc.text(item.name + (item.description ? ` (${item.description})` : ''), 50, rowTop, {
          width: 220,
        });
        doc.text(String(item.quantity), 280, rowTop, { width: 50, align: 'right' });
        doc.text(item.unitPrice.toFixed(2), 340, rowTop, { width: 90, align: 'right' });
        doc.text(item.lineTotal.toFixed(2), 440, rowTop, { width: 90, align: 'right' });
        doc.moveDown(0.5);
      }

      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(530, doc.y).stroke();
      doc.moveDown(0.5);

      doc.text(`Subtotal: ${input.subtotal.toFixed(2)}`, { align: 'right' });
      if (input.discount) {
        doc.text(`Discount: -${input.discount.toFixed(2)}`, { align: 'right' });
      }
      doc.text(`${input.taxLabel ?? 'Tax'}: ${input.tax.toFixed(2)}`, { align: 'right' });
      doc.fontSize(12).text(`Grand Total: ${input.grandTotal.toFixed(2)}`, { align: 'right' });

      if (input.notes) {
        doc.moveDown();
        doc.fontSize(10).text(`Notes: ${input.notes}`);
      }

      doc.end();
    });
  }
}
