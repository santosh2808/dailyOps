#!/usr/bin/env bash
# Sends a fake Google Ads lead to your DailyOps API, to prove the webhook works
# before connecting Google. Usage:
#   API=https://api.yourdomain.com GOOGLE_LEADS_WEBHOOK_KEY=xxxx ./scripts/simulate-ad-lead.sh
# Run it twice: the 2nd run must NOT create a second lead (same lead_id).
# Then check Leads: Source "Google Ads", Unassigned.
set -euo pipefail
: "${API:?set API, e.g. https://api.yourdomain.com}"
: "${GOOGLE_LEADS_WEBHOOK_KEY:?set GOOGLE_LEADS_WEBHOOK_KEY}"
LEAD_ID="${LEAD_ID:-sim-$(date +%Y%m%d)-1}"
curl -sS -i -X POST "$API/api/v1/webhooks/google-leads" \
  -H 'Content-Type: application/json' \
  -d "{\"lead_id\":\"$LEAD_ID\",\"google_key\":\"$GOOGLE_LEADS_WEBHOOK_KEY\",\"is_test\":false,
       \"campaign_id\":\"123\",\"form_id\":\"456\",
       \"user_column_data\":[
         {\"column_id\":\"FULL_NAME\",\"string_value\":\"Test Lead\"},
         {\"column_id\":\"PHONE_NUMBER\",\"string_value\":\"+919000000001\"},
         {\"column_id\":\"EMAIL\",\"string_value\":\"test@example.com\"},
         {\"column_id\":\"COMPANY_NAME\",\"string_value\":\"Test Co\"},
         {\"column_id\":\"REGION\",\"string_value\":\"Telangana\"}]}"
echo
