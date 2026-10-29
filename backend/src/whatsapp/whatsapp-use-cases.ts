// AiSensy integration — every WhatsApp send names its use case, so the
// AiSensy campaign, the expected number of template parameters and whether
// real sends are allowed at all are decided here, in one reviewed table,
// rather than by whatever the caller happens to pass.
//
// Only the four manual document shares can send for real, and only once
// AISENSY_API_KEY and that use case's campaign variable are both set. The
// four automatic notifications have no campaign variable on purpose: they
// stay simulated under AiSensy until a later, separately approved change
// gives them one — configuration alone can never switch them on.
export type WhatsAppUseCase =
  | 'QUOTATION_SHARE'
  | 'PROFORMA_INVOICE_SHARE'
  | 'TAX_INVOICE_SHARE'
  | 'JEO_SHARE'
  | 'LEAD_ASSIGNED'
  | 'LEAD_FOLLOWUP_REMINDER'
  | 'SITE_VISIT_SCHEDULED'
  | 'SALES_ORDER_STATUS';

export interface WhatsAppUseCaseConfig {
  // Env var holding the exact Live AiSensy campaign name; null = real
  // sends not approved for this use case yet.
  campaignEnv: string | null;
  // Must equal the number of {{n}} variables in the approved template —
  // AiSensy rejects a mismatch.
  paramCount: number;
  // Which template parameter is the recipient's name (AiSensy's required
  // `userName`, used for the contact it creates/updates).
  recipientNameParam: number;
}

export const WHATSAPP_USE_CASES: Record<WhatsAppUseCase, WhatsAppUseCaseConfig> = {
  QUOTATION_SHARE: { campaignEnv: 'AISENSY_QUOTATION_SHARE_CAMPAIGN', paramCount: 3, recipientNameParam: 0 },
  PROFORMA_INVOICE_SHARE: { campaignEnv: 'AISENSY_PROFORMA_INVOICE_SHARE_CAMPAIGN', paramCount: 3, recipientNameParam: 0 },
  TAX_INVOICE_SHARE: { campaignEnv: 'AISENSY_TAX_INVOICE_SHARE_CAMPAIGN', paramCount: 3, recipientNameParam: 0 },
  JEO_SHARE: { campaignEnv: 'AISENSY_JEO_SHARE_CAMPAIGN', paramCount: 3, recipientNameParam: 0 },
  LEAD_ASSIGNED: { campaignEnv: null, paramCount: 5, recipientNameParam: 0 },
  LEAD_FOLLOWUP_REMINDER: { campaignEnv: null, paramCount: 5, recipientNameParam: 0 },
  SITE_VISIT_SCHEDULED: { campaignEnv: null, paramCount: 3, recipientNameParam: 0 },
  SALES_ORDER_STATUS: { campaignEnv: null, paramCount: 3, recipientNameParam: 0 },
};
