import { useCallback, useRef, useState } from "react";
import { toast } from "@/lib/toast";

// Shared by the four "Share via WhatsApp" menu items (Quotation, Proforma
// Invoice, Tax Invoice, JEO). Ignores repeat clicks while a send is in
// flight (with AiSensy, the backend also refuses a repeat of the same
// document to the same number for 2 minutes), and words each
// outcome honestly: AiSensy's ACCEPTED only means the request was taken —
// delivery to the customer's phone is not confirmed.
export type WhatsAppSendStatus = "SENT" | "ACCEPTED" | "SIMULATED" | "FAILED" | "UNKNOWN" | "DUPLICATE";

interface WhatsAppShareResult {
  status: WhatsAppSendStatus;
  errorMessage?: string;
}

const FALLBACK_ERROR = "Could not send the WhatsApp message. Please try again.";

function showResult({ status, errorMessage }: WhatsAppShareResult) {
  switch (status) {
    case "SENT":
      toast.success("WhatsApp message sent.");
      return;
    case "ACCEPTED":
      toast.success("WhatsApp message accepted for sending. Delivery to the customer is not confirmed yet.");
      return;
    case "SIMULATED":
      // Bug fix (TC-094): a green "success" toast for a message that was
      // never actually sent is misleading — use "info" instead.
      toast.info("WhatsApp message logged (WhatsApp sending is not enabled — no real message was sent).");
      return;
    case "DUPLICATE":
      toast.info(errorMessage || "This was already sent to this number recently, so it was not sent again.");
      return;
    case "UNKNOWN":
      toast.error(errorMessage || "WhatsApp did not confirm whether the message was sent. Check before sending it again.");
      return;
    default:
      toast.error(errorMessage || FALLBACK_ERROR);
  }
}

export function useWhatsAppShare() {
  const inFlight = useRef(false);
  const [sending, setSending] = useState(false);

  const share = useCallback(async (send: () => Promise<WhatsAppShareResult>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    try {
      showResult(await send());
    } catch (err: any) {
      toast.error(err?.response?.data?.message || FALLBACK_ERROR);
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }, []);

  return { sending, share };
}
