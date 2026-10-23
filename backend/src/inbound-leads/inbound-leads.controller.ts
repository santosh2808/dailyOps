import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  InternalServerErrorException,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { InboundLeadsService } from './inbound-leads.service';
import { safeEqual, verifyMetaSignature } from './ad-lead-parsers';

// PUBLIC endpoints called by Meta and Google (no login): each request is
// authenticated by the platform's own secret — Meta's signed payload, Google's
// shared key — and every one fails closed if its secret isn't configured.
@ApiExcludeController()
@Controller('api/v1/webhooks')
export class InboundLeadsController {
  constructor(private service: InboundLeadsService) {}

  // Meta calls this once when the webhook is saved in the Meta app dashboard.
  @Get('meta-leads')
  verifyMeta(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ) {
    const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
    if (!expected) throw new ServiceUnavailableException('Meta lead webhook is not configured');
    if (mode === 'subscribe' && token && safeEqual(token, expected)) return challenge ?? '';
    throw new UnauthorizedException('Verification failed');
  }

  @Post('meta-leads')
  @HttpCode(200)
  async receiveMeta(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() body: any,
  ) {
    const appSecret = process.env.META_APP_SECRET;
    const pageToken = process.env.META_PAGE_ACCESS_TOKEN;
    if (!appSecret || !pageToken) throw new ServiceUnavailableException('Meta lead webhook is not configured');
    if (!verifyMetaSignature(req.rawBody, signature, appSecret)) throw new UnauthorizedException('Bad signature');

    const version = process.env.META_GRAPH_VERSION || 'v21.0';
    const result = await this.service.handleMeta(body, async (leadgenId) => {
      const url =
        `https://graph.facebook.com/${version}/${encodeURIComponent(leadgenId)}` +
        `?fields=field_data,created_time,campaign_id,ad_id,form_id&access_token=${encodeURIComponent(pageToken)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Meta Graph API ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return res.json();
    });
    // 5xx makes Meta redeliver; leads that already succeeded are skipped on retry.
    if (result.failed > 0) throw new InternalServerErrorException('Some leads could not be processed');
    return { received: true };
  }

  // Google Ads lead form extension -> "Webhook integration" (URL + key).
  @Post('google-leads')
  @HttpCode(200)
  async receiveGoogle(@Body() body: any) {
    const key = process.env.GOOGLE_LEADS_WEBHOOK_KEY;
    if (!key) throw new ServiceUnavailableException('Google lead webhook is not configured');
    if (typeof body?.google_key !== 'string' || !safeEqual(body.google_key, key)) {
      throw new UnauthorizedException('Bad key');
    }
    // Google's "send test data" button — acknowledge, don't create a lead.
    if (body.is_test === true) return { received: true, test: true };
    if (!body.lead_id) return { received: true };
    const outcome = await this.service.handleGoogle(body);
    if (outcome === 'failed') throw new InternalServerErrorException('Lead could not be processed');
    return { received: true };
  }
}
