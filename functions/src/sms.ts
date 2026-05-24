import twilio from "twilio";

/**
 * Send a message via Twilio. Defaults to SMS. Set channel="whatsapp"
 * to route via WhatsApp; that requires TWILIO_WHATSAPP_FROM to be set
 * to an approved WABA sender (or the Twilio sandbox number for dev),
 * and the recipient must have opted in. Falls back to SMS if WhatsApp
 * env is missing so a misconfigured deploy doesn't drop the message.
 */
export async function sendSms(opts: {
  to: string; // E.164
  body: string;
  channel?: "sms" | "whatsapp";
}): Promise<{ sid: string; channel: "sms" | "whatsapp" } | null> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const smsFrom = process.env.TWILIO_PHONE_NUMBER;
  const waFrom = process.env.TWILIO_WHATSAPP_FROM;
  if (!accountSid || !authToken) {
    console.warn("[sms] Twilio env not set; skip send");
    return null;
  }

  const wantsWhatsapp = opts.channel === "whatsapp";
  const useWhatsapp = wantsWhatsapp && !!waFrom;
  if (wantsWhatsapp && !useWhatsapp) {
    console.warn("[sms] whatsapp requested but TWILIO_WHATSAPP_FROM unset; falling back to SMS");
  }
  const from = useWhatsapp ? waFrom! : smsFrom;
  if (!from) {
    console.warn("[sms] no sender configured; skip send");
    return null;
  }
  const to = useWhatsapp ? `whatsapp:${opts.to}` : opts.to;
  const fromAddr = useWhatsapp && !from.startsWith("whatsapp:")
    ? `whatsapp:${from}`
    : from;

  try {
    const client = twilio(accountSid, authToken);
    const msg = await client.messages.create({
      to,
      from: fromAddr,
      body: opts.body,
    });
    const channel: "sms" | "whatsapp" = useWhatsapp ? "whatsapp" : "sms";
    console.log(`[sms] sent sid=${msg.sid} channel=${channel} to=${opts.to.slice(-4)}`);
    return { sid: msg.sid, channel };
  } catch (err) {
    console.error("[sms] send failed", err);
    return null;
  }
}

/** Build the candidate's profile URL with the HMAC token. */
export function buildProfileUrl(opts: {
  publicWebOrigin?: string;
  sessionId: string;
  token: string;
}): string {
  const origin =
    opts.publicWebOrigin ??
    process.env.APP_BASE_URL ??
    "https://giggrab.io";
  const u = new URL("/profile", origin);
  u.searchParams.set("sessionId", opts.sessionId);
  u.searchParams.set("token", opts.token);
  return u.toString();
}
