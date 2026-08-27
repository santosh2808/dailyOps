import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { QuotationsService } from './quotations.service';
import { AcceptPublicQuotationDto } from './dto/accept-public-quotation.dto';
import { RejectPublicQuotationDto } from './dto/reject-public-quotation.dto';

// Customer Quotation Acceptance workflow — the public, customer-facing
// counterpart to QuotationsController. Deliberately its own controller
// (rather than new routes bolted onto QuotationsController) so it can have
// NO auth guards at all: this is reached from an email link by someone who
// has never logged into DailyOps and never will (requirement: "Do NOT
// require the customer to have a DailyOps account"). Every method on
// QuotationsService this calls re-validates the token/expiry itself, so
// nothing here relies on the absence of a guard for correctness — only for
// letting the request in at all.
@ApiTags('public-quotations')
@Controller('api/v1/public/quotations')
export class PublicQuotationsController {
  constructor(private quotationsService: QuotationsService) {}

  // Best-effort client identifier for the in-memory rate limiter — real IP
  // when available (respects a trusted reverse proxy's X-Forwarded-For, same
  // as Express's own req.ip when app.set('trust proxy') is configured),
  // falling back to a constant bucket if genuinely unavailable rather than
  // throwing.
  private clientKey(req: Request): string {
    return req.ip || 'unknown';
  }

  @Get(':token')
  getQuotation(@Param('token') token: string, @Req() req: Request) {
    return this.quotationsService.getPublicQuotation(token, this.clientKey(req));
  }

  @Get(':token/pdf')
  async getPdf(@Param('token') token: string, @Req() req: Request, @Res() res: Response) {
    const pdf = await this.quotationsService.getPublicPdf(token, this.clientKey(req));
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="quotation.pdf"' });
    res.send(pdf);
  }

  @Post(':token/accept')
  accept(
    @Param('token') token: string,
    @Body() dto: AcceptPublicQuotationDto,
    @Req() req: Request,
  ) {
    return this.quotationsService.acceptViaPublicLink(token, dto, this.clientKey(req));
  }

  @Post(':token/reject')
  reject(
    @Param('token') token: string,
    @Body() dto: RejectPublicQuotationDto,
    @Req() req: Request,
  ) {
    return this.quotationsService.rejectViaPublicLink(token, dto, this.clientKey(req));
  }
}
