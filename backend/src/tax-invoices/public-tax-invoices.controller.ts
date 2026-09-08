import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { TaxInvoicesService } from './tax-invoices.service';

// WhatsApp Share — the public, no-login counterpart to
// TaxInvoicesController's :id/pdf route, reached via publicToken instead of
// a DailyOps session. See ProformaInvoices' PublicProformaInvoicesController
// for the full rationale (same pattern, copied here).
@ApiTags('public-tax-invoices')
@Controller('api/v1/public/tax-invoices')
export class PublicTaxInvoicesController {
  constructor(private taxInvoicesService: TaxInvoicesService) {}

  @Get(':token/pdf')
  async getPdf(@Param('token') token: string, @Res() res: Response) {
    const pdf = await this.taxInvoicesService.getPublicPdf(token);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="tax-invoice.pdf"' });
    res.send(pdf);
  }
}
