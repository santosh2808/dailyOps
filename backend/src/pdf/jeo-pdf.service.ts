import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import PDFDocument = require('pdfkit');
import type { ProductTechnicalSpec } from '../products/dto/create-product.dto';

// Branded "Internal Job Execution Order" PDF — an exact reproduction of the
// customer-supplied reference template ("JEO 5478.doc"): a cover letter to
// Production, then an Annexure-I technical-specification sheet per item
// (a subset of the same fields quotation-pdf.service.ts already renders
// for the customer-facing Techno-Commercial Offer, minus the commercial
// rows — Unit Price/Installation/Transportation/GST have no place on an
// internal production document). Self-contained, same "one file per
// branded template, no cross-file coupling" convention as
// quotation-pdf.service.ts / proforma-invoice-pdf.service.ts — the overlap
// in spec-row logic is intentionally duplicated rather than shared.
export interface JeoPdfCustomer {
  companyName: string;
  state?: string | null;
}

export interface JeoPdfItem {
  quantity: number;
  product: { name: string; technicalSpec?: unknown };
}

export interface JeoPdfInput {
  jeoNumber: string;
  createdAt: Date;
  deliveryDate?: Date | null;
  priority: string;
  customer: JeoPdfCustomer;
  // Free-text, multi-line — see SalesOrder.billingAddress/shippingAddress.
  billingAddress?: string | null;
  shippingAddress?: string | null;
  remarks?: string | null;
  items: JeoPdfItem[];
  // Name of whoever generated/is sending this JEO — the actual signatory
  // line. Never hardcoded to one person's name (this app has no fixed
  // "who signs JEOs" concept), same convention as Quotation's `sentBy`.
  generatedBy?: string | null;
}

const ASSETS_DIR = path.join(__dirname, 'assets');
const LOGO_SPYRO = path.join(ASSETS_DIR, 'logo-spyro-fans.png');
const LOGO_SR = path.join(ASSETS_DIR, 'logo-smart-rotamach.jpg');

const PAGE_MARGIN = 45;
const GREEN = '#4b8f29';
const BLUE = '#1f4e96';
const BORDER = '#94a3b8';

const COMPANY_NAME = 'SMART ROTAMACH PRIVATE LIMITED';
const COMPANY_ADDRESS = '# 6-2-982, 3rd Floor, GNR Arcade, Khairatabad, Hyderabad-500004, Telangana, India.';
const COMPANY_CONTACT_LINE = 'Sales Ph: 9949465932; Email : info@spyrofan.com; www.spyrofan.com';

// Fixed internal recipients for every JEO — Smart Rotamach's own Production
// in-charge and the Managing Director who this is routed "through proper
// channel" to. There is no Production-team/organization-chart module in
// this app, so these are constants rather than derived from data; if that
// ever changes at the company, update here (or move to env vars/a Settings
// screen) rather than in the template logic below.
const PRODUCTION_INCHARGE_NAME = 'Mr. Krishna';
const PRODUCTION_INCHARGE_TITLE = 'In-charge – Production';
const CHANNEL_NAME = 'Mr. Amarpal Gampa';
const CHANNEL_TITLE = 'Managing Director';

// Identical wording to quotation-pdf.service.ts's WARRANTY_CONDITIONS —
// duplicated rather than imported (see module comment above), kept in sync
// by hand since it's company-wide boilerplate, not per-product data.
const WARRANTY_CONDITIONS =
  'The above warranty is valid for the functioning of the fan and its allied electrical equipment, if there is any physical damage and opening of the equipment by others without notice to us shall not be considered into the warranty clause. The customer has to ensure clear power supply through a stabilizer to the drive. The warranty does not cover any damage caused due to voltage surges.';

interface SpecRow {
  label: string;
  value: string;
}

@Injectable()
export class JeoPdfService {
  private readonly logger = new Logger(JeoPdfService.name);

  render(jeo: JeoPdfInput): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      try {
        this.draw(doc, jeo);
      } catch (error) {
        this.logger.error('JEO PDF rendering failed', error instanceof Error ? error.stack : error);
        reject(error);
        return;
      }

      doc.end();
    });
  }

  private draw(doc: PDFKit.PDFDocument, jeo: JeoPdfInput): void {
    const pageBottom = doc.page.height - PAGE_MARGIN - 45;
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
    this.drawCoverLetter(doc, jeo, contentLeft, contentWidth);
    this.drawFooter(doc);

    jeo.items.forEach((item, index) => {
      doc.addPage();
      this.drawHeader(doc);
      this.drawAnnexureHeading(doc, jeo.items.length > 1 ? index + 1 : null, item, contentLeft, contentWidth);

      const rows = this.buildSpecRows(item);
      for (const row of rows) {
        this.drawTwoColRow(doc, row.label, row.value, contentLeft, contentWidth, ensureSpace);
      }

      doc.moveDown(1);
      ensureSpace(24);
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('black')
        .text('Standard Scope of Supply Includes :', contentLeft, doc.y, { width: contentWidth });
      doc.moveDown(0.3);

      const scope = this.getTechnicalSpec(item)?.scopeOfSupply ?? [];
      if (scope.length === 0) {
        ensureSpace(16);
        doc
          .font('Helvetica-Oblique')
          .fontSize(9)
          .fillColor('#64748b')
          .text('(No scope-of-supply items configured for this product yet.)', contentLeft, doc.y, { width: contentWidth });
      } else {
        this.drawTableHeaderRow(doc, ['Items', 'Quantity / Fan'], [contentWidth * 0.6, contentWidth * 0.4], contentLeft, ensureSpace);
        for (const row of scope) {
          this.drawTwoColDataRow(doc, row.item, row.quantityPerFan, [contentWidth * 0.6, contentWidth * 0.4], contentLeft, ensureSpace);
        }
      }

      this.drawFooter(doc);
    });
  }

  // ---- Header / Footer ---------------------------------------------------

  private drawHeader(doc: PDFKit.PDFDocument): void {
    const top = PAGE_MARGIN;
    const contentLeft = PAGE_MARGIN;
    const contentWidth = doc.page.width - PAGE_MARGIN * 2;

    this.safeImage(doc, LOGO_SR, contentLeft, top, { height: 34 });
    this.safeImage(doc, LOGO_SPYRO, contentLeft + contentWidth - 100, top, { height: 34 });

    doc.y = top + 44;
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

  // ---- Cover letter -------------------------------------------------------

  private drawCoverLetter(doc: PDFKit.PDFDocument, jeo: JeoPdfInput, contentLeft: number, contentWidth: number): void {
    doc.font('Helvetica-Bold').fontSize(16).fillColor('black');
    doc.text(`INTERNAL JOB EXECUTION ORDER ${jeo.jeoNumber.replace(/^JEO-/, '')}`, contentLeft, doc.y, {
      width: contentWidth,
      align: 'center',
    });
    doc.moveDown(0.8);

    // To / Date row.
    const col1 = contentWidth * 0.65;
    const rowTop = doc.y;
    doc.lineWidth(0.75).strokeColor(BORDER);
    doc.rect(contentLeft, rowTop, col1, 60).stroke();
    doc.rect(contentLeft + col1, rowTop, contentWidth - col1, 60).stroke();
    doc.font('Helvetica-Bold').fontSize(10).fillColor('black');
    doc.text('To', contentLeft + 6, rowTop + 5);
    doc.text(`${PRODUCTION_INCHARGE_NAME},`, contentLeft + 6, doc.y);
    doc.text(PRODUCTION_INCHARGE_TITLE, contentLeft + 6, doc.y);
    doc.text(COMPANY_NAME, contentLeft + 6, doc.y);
    doc.text(this.formatDate(jeo.createdAt), contentLeft + col1 + 6, rowTop + 5, { width: contentWidth - col1 - 12, align: 'right' });
    doc.y = rowTop + 60;

    doc.moveDown(0.3);
    doc.moveTo(contentLeft, doc.y).lineTo(contentLeft + contentWidth, doc.y).strokeColor(BORDER).stroke();
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text(`Through Proper Channel : ${CHANNEL_NAME}, ${CHANNEL_TITLE}`, contentLeft, doc.y, {
      width: contentWidth,
      align: 'center',
    });
    doc.moveDown(0.3);
    doc.moveTo(contentLeft, doc.y).lineTo(contentLeft + contentWidth, doc.y).strokeColor(BORDER).stroke();
    doc.moveDown(0.8);

    const firstName = PRODUCTION_INCHARGE_NAME.replace(/^Mr\.\s*/, '');
    doc.font('Helvetica').fontSize(10.5);
    doc.text(`Dear ${firstName},`, contentLeft, doc.y, { width: contentWidth });
    doc.moveDown(0.8);

    doc.text(this.buildOrderSummary(jeo), contentLeft, doc.y, { width: contentWidth });
    doc.moveDown(0.8);

    doc.text('I herewith attached the technical specifications for your necessary action in production.', contentLeft, doc.y, {
      width: contentWidth,
    });
    doc.moveDown(0.8);

    const deliveryTarget = jeo.deliveryDate ? this.formatDate(jeo.deliveryDate) : 'Can be informed.';
    doc.text(`DELIVERY TARGET : ${deliveryTarget}`, contentLeft, doc.y, { width: contentWidth });
    doc.moveDown(0.8);

    // Billing / Site address table.
    const billingLines = (jeo.billingAddress ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
    const shippingLines = (jeo.shippingAddress ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
    const siteIsSameAsBilling = shippingLines.length === 0 || jeo.shippingAddress?.trim() === jeo.billingAddress?.trim();

    const addrCol = contentWidth / 2;
    let y = doc.y;
    doc.lineWidth(0.75).strokeColor(BORDER);
    doc.rect(contentLeft, y, addrCol, 20).fillAndStroke('#eef2f7', BORDER);
    doc.rect(contentLeft + addrCol, y, addrCol, 20).fillAndStroke('#eef2f7', BORDER);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#3730a3');
    doc.text('BILLING ADDRESS :', contentLeft, y + 5, { width: addrCol, align: 'center' });
    doc.text('SITE ADDRESS :', contentLeft + addrCol, y + 5, { width: addrCol, align: 'center' });
    y += 20;

    const billingBlock = billingLines.length > 0 ? billingLines : [jeo.customer.companyName];
    const siteBlock = siteIsSameAsBilling ? ['Same as Billing Address'] : shippingLines;
    const blockHeight =
      Math.max(
        doc.heightOfString(billingBlock.join('\n'), { width: addrCol - 12 }),
        doc.heightOfString(siteBlock.join('\n'), { width: addrCol - 12 }),
      ) + 12;
    doc.rect(contentLeft, y, addrCol, blockHeight).stroke();
    doc.rect(contentLeft + addrCol, y, addrCol, blockHeight).stroke();
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('black');
    doc.text(billingBlock.join('\n'), contentLeft + 6, y + 6, { width: addrCol - 12 });
    doc.font('Helvetica').text(siteBlock.join('\n'), contentLeft + addrCol + 6, y + 6, { width: addrCol - 12 });
    doc.y = y + blockHeight;

    doc.moveDown(0.8);
    doc.font('Helvetica').fontSize(10.5).fillColor('black');
    doc.text('Hope above is in line and request you to proceed further.', contentLeft, doc.y, { width: contentWidth });
    doc.moveDown(0.6);
    doc.text('Thanks & Regards,', contentLeft, doc.y, { width: contentWidth });
    doc.moveDown(1.5);

    doc.font('Helvetica-Bold');
    doc.text(jeo.generatedBy?.trim() || 'Sales Team', contentLeft, doc.y, { width: contentWidth });
    doc.font('Helvetica').text(COMPANY_NAME, contentLeft, doc.y, { width: contentWidth });
    doc.text('SPYRO FAN Division.', contentLeft, doc.y, { width: contentWidth });
    doc.moveDown(0.8);

    doc.text('Encl:  a) Technical Specifications.', contentLeft, doc.y, { width: contentWidth });
    doc.moveDown(0.5);
    doc.text('CC To:     a) Managing Director', contentLeft, doc.y, { width: contentWidth });
    doc.text('               b) Commercial / Accounts', contentLeft, doc.y, { width: contentWidth });

    if (jeo.remarks && jeo.remarks.trim()) {
      doc.moveDown(0.8);
      doc.font('Helvetica-Bold').fontSize(9.5).text('Remarks:', contentLeft, doc.y);
      doc.font('Helvetica').text(jeo.remarks.trim(), contentLeft, doc.y, { width: contentWidth });
    }
  }

  private buildOrderSummary(jeo: JeoPdfInput): string {
    const location = jeo.customer.state?.trim();
    const customerLine = location ? `${jeo.customer.companyName.toUpperCase()}, ${location.toUpperCase()}` : jeo.customer.companyName.toUpperCase();

    const itemDescriptions = jeo.items.map((item) => {
      const spec = this.getTechnicalSpec(item);
      const size = spec?.fanSize?.trim() || item.product.name;
      const model = spec?.modelNo?.trim() || item.product.name;
      const blades = spec?.noOfBlades?.trim();
      return `${item.quantity} No. ${size} dia HVLS ${model}${blades ? ` (all ${blades} Wings)` : ''}`;
    });

    return (
      `We have received an order from ${customerLine} for their requirement of ` +
      `${itemDescriptions.join('; ')} with standard aluminium colour Fans.`
    );
  }

  private drawAnnexureHeading(
    doc: PDFKit.PDFDocument,
    itemNumber: number | null,
    item: JeoPdfItem,
    contentLeft: number,
    contentWidth: number,
  ): void {
    doc.font('Helvetica-Bold').fontSize(12).fillColor('black');
    doc.text('ANNEXURE – I', contentLeft, doc.y, { width: contentWidth, align: 'center' });
    doc.text('SCOPE OF SUPPLY | TECHNICAL SPECIFICATIONS', contentLeft, doc.y, { width: contentWidth, align: 'center' });
    doc.moveDown(0.6);

    if (itemNumber != null) {
      const spec = this.getTechnicalSpec(item);
      const label = spec?.modelNo?.trim() || item.product.name;
      doc.font('Helvetica-Bold').fontSize(10).fillColor(BLUE);
      doc.text(`Item ${itemNumber}: ${label} (Qty: ${item.quantity})`, contentLeft, doc.y, { width: contentWidth });
      doc.fillColor('black');
      doc.moveDown(0.3);
    }
  }

  // ---- Spec table (subset of quotation-pdf.service.ts's Annexure-I) ------

  private getTechnicalSpec(item: JeoPdfItem): ProductTechnicalSpec | undefined {
    const raw = item.product.technicalSpec;
    if (!raw || typeof raw !== 'object') return undefined;
    return raw as ProductTechnicalSpec;
  }

  private buildSpecRows(item: JeoPdfItem): SpecRow[] {
    const spec = this.getTechnicalSpec(item) ?? {};
    const dash = (v?: string) => (v && v.trim() ? v.trim() : '—');

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
      { label: 'Quantity', value: `${item.quantity} No.` },
    ];
  }

  // ---- Generic table row helpers (explicit-coordinate, same pattern as
  // quotation-pdf.service.ts) --------------------------------------------

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
      Math.max(doc.heightOfString(label, { width: col1 - 12 }), doc.heightOfString(value, { width: col2 - 12 })) + 8;
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
        this.logger.warn(`Image not found, skipping: ${filePath}`);
      }
    } catch (error) {
      this.logger.warn(`Could not embed image ${filePath}: ${error instanceof Error ? error.message : error}`);
    }
  }

  private formatDate(date: Date): string {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }
}
