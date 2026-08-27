import { Module } from '@nestjs/common';
import { PdfService } from './pdf.service';
import { QuotationPdfService } from './quotation-pdf.service';
import { ProformaInvoicePdfService } from './proforma-invoice-pdf.service';
import { JeoPdfService } from './jeo-pdf.service';
import { TaxInvoicePdfService } from './tax-invoice-pdf.service';

@Module({
  // PdfService: generic renderer, still available for any future
  // non-branded document. QuotationPdfService: the branded "Techno-
  // Commercial Offer" template used specifically for Quotation PDFs (see
  // QuotationsService.getPdf()/sendQuotation()). ProformaInvoicePdfService/
  // JeoPdfService: the branded Proforma Invoice / Internal Job Execution
  // Order templates (see ProformaInvoicesService.getPdf()/
  // JobExecutionOrdersService.getPdf()). TaxInvoicePdfService: the branded
  // GST Tax Invoice template (see TaxInvoicesService.getPdf()).
  providers: [PdfService, QuotationPdfService, ProformaInvoicePdfService, JeoPdfService, TaxInvoicePdfService],
  exports: [PdfService, QuotationPdfService, ProformaInvoicePdfService, JeoPdfService, TaxInvoicePdfService],
})
export class PdfModule {}
