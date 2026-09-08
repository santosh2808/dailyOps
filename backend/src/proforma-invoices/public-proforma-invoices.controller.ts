import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ProformaInvoicesService } from './proforma-invoices.service';

// WhatsApp Share — the public, no-login counterpart to
// ProformaInvoicesController's :id/pdf route, reached via publicToken
// instead of a DailyOps session. Deliberately its own controller with NO
// auth guards, same rationale as Quotations' PublicQuotationsController:
// the person opening a wa.me link has never logged into DailyOps. The
// token itself (24 random bytes) is the only thing standing in for auth
// here — there's no separate rate limiter or expiry, unlike the Quotation
// acceptance workflow, because this is just a PDF view link with no
// state-changing actions (no accept/reject to protect).
@ApiTags('public-proforma-invoices')
@Controller('api/v1/public/proforma-invoices')
export class PublicProformaInvoicesController {
  constructor(private proformaInvoicesService: ProformaInvoicesService) {}

  @Get(':token/pdf')
  async getPdf(@Param('token') token: string, @Res() res: Response) {
    const pdf = await this.proformaInvoicesService.getPublicPdf(token);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="proforma-invoice.pdf"' });
    res.send(pdf);
  }
}
