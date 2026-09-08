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
    const pdf = await this.jobExecutionOrdersService.getPublicPdf(token);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="job-execution-order.pdf"' });
    res.send(pdf);
  }
}
