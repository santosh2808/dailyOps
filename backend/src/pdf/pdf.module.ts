import { Module } from '@nestjs/common';
import { PdfService } from './pdf.service';
import { QuotationPdfService } from './quotation-pdf.service';

@Module({
  // PdfService: generic renderer, still available for any future
  // non-branded document. QuotationPdfService: the branded "Techno-
  // Commercial Offer" template used specifically for Quotation PDFs (see
  // QuotationsService.getPdf()/sendQuotation()).
  providers: [PdfService, QuotationPdfService],
  exports: [PdfService, QuotationPdfService],
})
export class PdfModule {}
