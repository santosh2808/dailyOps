import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JobExecutionOrdersService } from './job-execution-orders.service';

// WhatsApp Share — the public, no-login counterpart to
// JobExecutionOrdersController's :id/pdf route, reached via publicToken
// instead of a DailyOps session. See ProformaInvoices'
// PublicProformaInvoicesController for the full rationale (same pattern,
// copied here). Customer-facing only — there is no public equivalent of
// the internal :id/send (factory notification) route.
@ApiTags('public-job-execution-orders')
@Controller('api/v1/public/job-execution-orders')
export class PublicJobExecutionOrdersController {
  constructor(private jobExecutionOrdersService: JobExecutionOrdersService) {}

  @Get(':token/pdf')
  async getPdf(@Param('token') token: string, @Res() res: Response) {
    const { pdf, filename } = await this.jobExecutionOrdersService.getPublicPdf(token);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${filename}"` });
    res.send(pdf);
  }

  // The in-app "View PDF" link (JobExecutionOrdersController's
  // :id/pdf-link). No login: the signed, short-lived token in the path is
  // the authorization. The trailing file name is what the browser names a
  // download; it isn't trusted — the response is always this JEO's.
  @Get(':id/view/:token/:filename')
  async getPdfViaLink(@Param('id') id: string, @Param('token') token: string, @Res() res: Response) {
    const { pdf, filename } = await this.jobExecutionOrdersService.getPdfViaLink(id, token);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
    });
    res.send(pdf);
  }
}
