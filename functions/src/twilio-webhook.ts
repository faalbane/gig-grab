import { Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import twilio from "twilio";
import { db, sessions } from "@gig-grab/db";
import { eq } from "drizzle-orm";
import { extractProfile } from "./profile";
import { extractEmployerJob } from "./employer-extraction";
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
  if (!wsBase) {
    twiml.say(
      { voice: "Polly.Joanna" },
      "Hi! Thanks for calling GigGrab. Our AI recruiter isn't configured yet. Please try again in a few minutes. Goodbye.",
    );
    res.type("text/xml").send(twiml.toString());
    return;
  }

  // No /healthz pre-flight — used to add ~200ms-1.5s of latency before the
  // candidate heard anything. Agent is stable now; if its WS connect fails
  // Twilio drops to dead air either way.
  // Twilio strips query strings from <Stream url="…"/> on the WebSocket
  // connect URL AND does NOT promote them to customParameters. Use
  // <Parameter> child elements — Twilio delivers them in the start frame's
  // `start.customParameters` field.
  const connect = twiml.connect();
  const stream = connect.stream({ url: wsBase });
  stream.parameter({ name: "sessionId", value: sessionId });
  stream.parameter({ name: "language", value: session.language ?? "en" });
  res.type("text/xml").send(twiml.toString());
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
    // Route to the right extractor based on session.kind. Look up the row
    // since Twilio's payload doesn't tell us.
    const [row] = await db()
      .select({ kind: sessions.kind })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);
    if (row?.kind === "employer_intake") {
      void extractEmployerJob(sessionId).catch((err) =>
        console.error("[extract:job] failed", err),
      );
    } else {
      void extractProfile(sessionId).catch((err) =>
        console.error("[extract:profile] failed", err),
      );
    }
  }

  res.status(204).send();
}
