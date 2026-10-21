import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LeadsService } from '../leads/leads.service';
import { ParsedAdLead, parseGoogleColumns, parseMetaFieldData } from './ad-lead-parsers';

type Provider = 'META' | 'GOOGLE_ADS';

const PLATFORM_LABEL: Record<Provider, string> = {
  META: 'Meta lead ad',
  GOOGLE_ADS: 'Google Ads lead form',
};

export interface InboundResult {
  processed: number;
  duplicates: number;
  failed: number;
}

// Turns ad-platform webhook deliveries into Leads. Idempotent per
// (provider, externalId): the platforms retry, and a retry of something that
// already became a lead (or was a duplicate) is a no-op. A failed attempt is
// recorded and retried on the platform's next delivery.
@Injectable()
export class InboundLeadsService {
  private readonly logger = new Logger(InboundLeadsService.name);

  constructor(
    private prisma: PrismaService,
    private leadsService: LeadsService,
  ) {}

  async processLead(
    provider: Provider,
    externalId: string,
    load: () => Promise<ParsedAdLead>,
    payload: unknown,
  ): Promise<'created' | 'duplicate' | 'skipped' | 'failed'> {
    const existing = await this.prisma.inboundLeadEvent.findUnique({
      where: { provider_externalId: { provider, externalId } },
    });
    if (existing && existing.status !== 'FAILED') return 'skipped';

    try {
      const parsed = await load();
      const { lead, duplicateOf } = await this.leadsService.createFromAdLead({
        source: provider,
        platformLabel: PLATFORM_LABEL[provider],
        ...parsed,
      });
      const status = duplicateOf ? 'DUPLICATE' : 'CREATED';
      await this.prisma.inboundLeadEvent.upsert({
        where: { provider_externalId: { provider, externalId } },
        create: { provider, externalId, status, leadId: lead.id, payload: payload as Prisma.InputJsonValue },
        update: { status, leadId: lead.id, error: null },
      });
      return duplicateOf ? 'duplicate' : 'created';
    } catch (err) {
      const message = (err as Error)?.message ?? 'Unknown error';
      this.logger.error(`Inbound ${provider} lead ${externalId} failed: ${message}`);
      await this.prisma.inboundLeadEvent
        .upsert({
          where: { provider_externalId: { provider, externalId } },
          create: { provider, externalId, status: 'FAILED', error: message.slice(0, 500), payload: payload as Prisma.InputJsonValue },
          update: { status: 'FAILED', error: message.slice(0, 500) },
        })
        .catch(() => undefined);
      return 'failed';
    }
  }

  // Meta: the webhook only carries ids; the answers are fetched from the Graph API.
  async handleMeta(
    body: any,
    fetchLead: (leadgenId: string) => Promise<any>,
  ): Promise<InboundResult> {
    const result: InboundResult = { processed: 0, duplicates: 0, failed: 0 };
    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        if (change?.field !== 'leadgen') continue;
        const v = change.value ?? {};
        const leadgenId = String(v.leadgen_id ?? '');
        if (!leadgenId) continue;
        const outcome = await this.processLead(
          'META',
          leadgenId,
          async () => {
            const data = await fetchLead(leadgenId);
            return parseMetaFieldData(data?.field_data, {
              adId: v.ad_id,
              campaignId: data?.campaign_id,
              formId: v.form_id,
            });
          },
          { leadgen_id: leadgenId, form_id: v.form_id, ad_id: v.ad_id, page_id: v.page_id },
        );
        if (outcome === 'created') result.processed++;
        else if (outcome === 'duplicate') result.duplicates++;
        else if (outcome === 'failed') result.failed++;
      }
    }
    return result;
  }

  // Google: the answers are in the POST body itself.
  async handleGoogle(body: any): Promise<'created' | 'duplicate' | 'skipped' | 'failed'> {
    const leadId = String(body?.lead_id ?? '');
    return this.processLead(
      'GOOGLE_ADS',
      leadId,
      async () =>
        parseGoogleColumns(body?.user_column_data, {
          campaignId: body?.campaign_id,
          formId: body?.form_id,
          adgroupId: body?.adgroup_id,
        }),
      { lead_id: leadId, form_id: body?.form_id, campaign_id: body?.campaign_id },
    );
  }
}
