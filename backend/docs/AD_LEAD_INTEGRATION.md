# Ad leads straight into DailyOps (Meta + Google Ads)

Leads from Facebook/Instagram lead ads and Google Ads lead forms arrive in DailyOps
automatically as **Unassigned** leads (Source: Meta / Google Ads). Managers and
telecallers assign them as usual. No Excel download/import needed.

Duplicates: if an open lead already has the same phone number, no new lead is made;
a note is added to that lead's timeline instead. Every delivery is recorded in
`InboundLeadEvent` (CREATED / DUPLICATE / FAILED); a failed one is retried when the
platform redelivers.

Nothing here has been tested against a live Meta or Google account yet — test with
the platforms' test tools first (below).

## Env vars (backend `.env`)

| Var | Purpose |
|---|---|
| `META_WEBHOOK_VERIFY_TOKEN` | Any random string you choose; paste the same into Meta |
| `META_APP_SECRET` | Meta app > Settings > Basic > App secret (signature check) |
| `META_PAGE_ACCESS_TOKEN` | Long-lived Page token with `leads_retrieval` |
| `META_GRAPH_VERSION` | Optional, default `v21.0` |
| `GOOGLE_LEADS_WEBHOOK_KEY` | Random string; paste into the Google lead form |

An endpoint with its secret unset answers 503 (off).

## Meta

1. developers.facebook.com > your app > add **Webhooks** product > object **Page** >
   callback URL `https://<your-api-host>/api/v1/webhooks/meta-leads`, verify token =
   `META_WEBHOOK_VERIFY_TOKEN`. Subscribe to the **leadgen** field.
2. Subscribe the app to the Page (Page > `subscribed_apps` with `leadgen`).
3. Create a long-lived Page access token with `leads_retrieval`, `pages_show_list`,
   `pages_manage_metadata`; set `META_PAGE_ACCESS_TOKEN`.
4. Test with Meta's *Lead Ads Testing Tool* (developers.facebook.com/tools/lead-ads-testing).

Caveat: for real (non-test) leads Meta normally needs the app in Live mode with
Advanced Access (app review) for `leads_retrieval`. Plan time for that.

## Google Ads

Lead form asset > **Webhook integration**: URL
`https://<your-api-host>/api/v1/webhooks/google-leads`, Key = `GOOGLE_LEADS_WEBHOOK_KEY`.
Use **Send test data** — it is acknowledged without creating a lead.

## Deploy

Run migration `20261021130000_add_inbound_ad_leads` (adds `GOOGLE_ADS` source +
`InboundLeadEvent`). The API must be reachable over public HTTPS. If a proxy sits in
front, it must pass the request body unmodified (Meta's signature is over raw bytes).

## Quick self-test (before connecting Google/Meta)

`API=https://<api-host> GOOGLE_LEADS_WEBHOOK_KEY=<key> ./scripts/simulate-ad-lead.sh`

Expect HTTP 200 and a new Unassigned lead (Source: Google Ads). Run it again: still
HTTP 200 but no second lead. A wrong key returns 401; no key configured returns 503.
Meta check: opening
`https://<api-host>/api/v1/webhooks/meta-leads?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=123`
in a browser must show `123`.
