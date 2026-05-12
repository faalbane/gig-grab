import twilio from "twilio";

/** Send an SMS via Twilio. Logs + swallows errors so callers don't crash. */
export async function sendSms(opts: {
  to: string; // E.164
  body: string;
}): Promise<{ sid: string } | null> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!accountSid || !authToken || !from) {
    console.warn("[sms] Twilio env not set; skip send");
    return null;
  }

  try {
    const client = twilio(accountSid, authToken);
    const msg = await client.messages.create({
      to: opts.to,
      from,
      body: opts.body,
    });
    console.log(`[sms] sent sid=${msg.sid} to=${opts.to.slice(-4)}`);
    return { sid: msg.sid };
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
