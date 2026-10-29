// AiSensy integration — the single HTTP call to AiSensy's Campaign API
// (https://wiki.aisensy.com/en/articles/11501889-api-reference-docs).
// Kept separate from WhatsAppService so it can be tested with a mocked
// fetch and so the API key only ever appears in this request body.
//
// AiSensy-specific notes:
// - The API key travels in the JSON body (`apiKey`), not a header.
// - `campaignName` must be an API campaign that is Live in AiSensy, built
//   on an approved template whose variable count equals templateParams.
// - A 2xx means AiSensy ACCEPTED the request, not that WhatsApp delivered
//   it — the status is reported as ACCEPTED, never as delivered.
// - AiSensy documents no idempotency key, so this never retries: a timeout,
//   a dropped connection mid-request or a 5xx is reported as UNKNOWN (the
//   message may already be on its way) instead of being resent.
import { maskPhone } from './normalize-phone';

export const AISENSY_SEND_URL = 'https://backend.aisensy.com/campaign/t1/api/v2';
export const AISENSY_TIMEOUT_MS = 10_000;

export interface AisensySendRequest {
  apiKey: string;
  campaignName: string;
  destination: string;
  userName: string;
  templateParams: string[];
}

export interface AisensySendOutcome {
  status: 'ACCEPTED' | 'FAILED' | 'UNKNOWN';
  errorMessage?: string;
}

// Connection errors raised before the request could reach AiSensy — safe
// to report as FAILED (nothing was sent), unlike a reset or timeout.
const NOT_SENT_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT']);

const UNKNOWN_MESSAGE = 'AiSensy did not confirm whether the message was sent. Check AiSensy before sending it again.';

export async function sendAisensyCampaign(
  request: AisensySendRequest,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = AISENSY_TIMEOUT_MS,
): Promise<AisensySendOutcome> {
  let res: Response;
  try {
    res = await fetchImpl(AISENSY_SEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: request.apiKey,
        campaignName: request.campaignName,
        destination: request.destination,
        userName: request.userName,
        templateParams: request.templateParams,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const code = (error as { cause?: { code?: string } })?.cause?.code;
    if (code && NOT_SENT_CODES.has(code)) {
      return { status: 'FAILED', errorMessage: `Could not reach AiSensy (${code}). The message was not sent.` };
    }
    return { status: 'UNKNOWN', errorMessage: UNKNOWN_MESSAGE };
  }

  const text = await res.text().catch(() => '');
  const detail = scrub(errorDetail(text), request);
  if (res.ok) {
    // The error format is undocumented, so an explicit `success: false`
    // inside a 2xx is treated as the rejection it says it is.
    if (!reportsFailure(text)) return { status: 'ACCEPTED' };
    return { status: 'FAILED', errorMessage: `AiSensy rejected the message${detail ? `: ${detail}` : ''}` };
  }
  if (res.status >= 500) {
    return { status: 'UNKNOWN', errorMessage: `${UNKNOWN_MESSAGE} (AiSensy returned ${res.status})` };
  }
  return {
    status: 'FAILED',
    errorMessage: `AiSensy rejected the message (${res.status})${detail ? `: ${detail}` : ''}`,
  };
}

// AiSensy's error body format is undocumented — take the first plausible
// message field, else the raw text, capped so a large HTML error page
// can't flood the logs or the UI.
function errorDetail(text: string): string {
  let detail = text;
  try {
    const body = JSON.parse(text);
    detail = [body?.message, body?.error, body?.errorMessage].find((v) => typeof v === 'string') ?? text;
  } catch {
    // not JSON — keep the raw text
  }
  return detail.replace(/\s+/g, ' ').trim().slice(0, 300);
}

function reportsFailure(text: string): boolean {
  try {
    const success = JSON.parse(text)?.success;
    return success === false || success === 'false';
  } catch {
    return false;
  }
}

// The detail ends up in logs, the history table and the user's toast, so
// the API key is removed and the phone number masked wherever AiSensy
// echoes it back (with or without the country code).
function scrub(text: string, { apiKey, destination }: AisensySendRequest): string {
  let out = apiKey ? text.split(apiKey).join('[redacted]') : text;
  const masked = maskPhone(destination);
  for (const form of [destination, destination.replace(/^\+/, ''), destination.slice(-10)]) {
    if (form) out = out.split(form).join(masked);
  }
  return out;
}
