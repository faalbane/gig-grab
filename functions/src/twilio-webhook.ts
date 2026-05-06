import { Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import twilio from "twilio";
import { db, sessions } from "@gig-grab/db";
import { eq } from "drizzle-orm";
import { extractProfile } from "./profile";
import { verifyTwilioSignature } from "./security";

/**
 * Twilio fetches this URL when the candidate picks up the call.
 * Returns TwiML that connects the call to our Pipecat agent's WebSocket.
 *
 * Skip signature verification — Twilio fetches this with our embedded URL
 * and we serve TwiML; no state mutation is performed here that would benefit
 * from rejection. (We do flip `status -> in_progress` but that's idempotent
 * and the only worst case is a noisy log entry from a curious caller.)
 */
export async function twilioVoice(
  req: Request,
  res: Response,
  sessionId: string,
): Promise<void> {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  const [session] = await db()
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!session) {
    twiml.say(
      { voice: "Polly.Joanna" },
      "Sorry, your session has expired. Please go back to the website and try again.",
    );
    res.type("text/xml").send(twiml.toString());
    return;
  }

  await db()
    .update(sessions)
    .set({ status: "in_progress" })
    .where(eq(sessions.id, sessionId));

  const wsBase = process.env.AGENT_WS_URL;
  const placeholder =
    "Hi! Thanks for calling GigGrab. Our AI recruiter is being set up right now — please try again in a few minutes. Talk to you soon. Goodbye.";

  // Pre-flight the agent: if its /healthz isn't reachable, serve a friendly
  // placeholder so the candidate doesn't sit in dead air. Once the agent
  // is reachable from Twilio's network the next call will succeed.
  if (wsBase) {
    const httpsBase = wsBase.replace(/^wss?:\/\//, "https://").replace(/\/ws$/, "");
    const healthOk = await checkAgentHealth(`${httpsBase}/healthz`);
    if (!healthOk) {
      console.warn(`[twiml] agent ${httpsBase}/healthz unreachable, serving placeholder`);
      twiml.say({ voice: "Polly.Joanna" }, placeholder);
      res.type("text/xml").send(twiml.toString());
      return;
    }
    const wsUrl = `${wsBase}?sessionId=${encodeURIComponent(
      sessionId,
    )}&language=${encodeURIComponent(session.language ?? "en")}`;
    const connect = twiml.connect();
    connect.stream({ url: wsUrl });
    res.type("text/xml").send(twiml.toString());
    return;
  }

  twiml.say({ voice: "Polly.Joanna" }, placeholder);
  res.type("text/xml").send(twiml.toString());
}

async function checkAgentHealth(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Twilio status callback — updates session.status as the call progresses.
 * Verifies X-Twilio-Signature so an attacker who guesses the sessionId
 * can't fake "completed" and trigger the (paid) Claude extraction.
 */
export async function twilioStatus(
  req: Request,
  res: Response,
  sessionId: string,
): Promise<void> {
  if (!verifyTwilioSignature(req)) {
    console.warn(`[twilio] invalid signature on /twilio/status/${sessionId}`);
    res.status(403).send();
    return;
  }

  const status = (req.body?.CallStatus ?? "") as string;
  const map: Record<string, string> = {
    queued: "ringing",
    initiated: "ringing",
    ringing: "ringing",
    "in-progress": "in_progress",
    completed: "completed",
    busy: "abandoned",
    "no-answer": "abandoned",
    canceled: "abandoned",
    failed: "failed",
  };
  const mapped = map[status];
  if (mapped) {
    await db()
      .update(sessions)
      .set({
        status: mapped as
          | "ringing"
          | "in_progress"
          | "completed"
          | "abandoned"
          | "failed",
        endedAt:
          mapped === "completed" ||
          mapped === "abandoned" ||
          mapped === "failed"
            ? new Date()
            : undefined,
      })
      .where(eq(sessions.id, sessionId));
  }

  if (mapped === "completed") {
    void extractProfile(sessionId).catch((err) =>
      console.error("[extract] failed", err),
    );
  }

  res.status(204).send();
}
