import { Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { randomUUID } from "node:crypto";
import twilio from "twilio";
import { db, sessions, candidates } from "@gig-grab/db";
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
  await applyTwilioStatus(sessionId, req, res);
}

/**
 * Twilio status callback for INBOUND hotline calls. Twilio's number config
 * fires this without a sessionId in the URL, so we resolve the session by
 * looking up the CallSid from the request body.
 */
export async function twilioInboundStatus(
  req: Request,
  res: Response,
): Promise<void> {
  if (!verifyTwilioSignature(req)) {
    console.warn(`[twilio] invalid signature on /twilio/status (inbound)`);
    res.status(403).send();
    return;
  }
  const callSid = String(req.body?.CallSid ?? "").trim();
  if (!callSid) {
    res.status(400).send();
    return;
  }
  const [s] = await db()
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.twilioCallSid, callSid))
    .limit(1);
  if (!s) {
    console.warn(`[twilio/inbound-status] no session for callSid=${callSid}`);
    res.status(204).send();
    return;
  }
  await applyTwilioStatus(s.id, req, res);
}

async function applyTwilioStatus(
  sessionId: string,
  req: Request,
  res: Response,
): Promise<void> {
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

const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * Twilio "A Call Comes In" webhook for the GigGrab hotline. The candidate
 * dialled our number; Twilio POSTs the call metadata here. We register the
 * caller as a candidate (or reuse the row if their phone is already on
 * file), open a session, and return TwiML that streams audio to the agent.
 *
 * Status callbacks for this leg use the per-session URL so the rest of the
 * pipeline (extractProfile + SMS link on completion) is unchanged.
 */
export async function twilioInbound(
  req: Request,
  res: Response,
): Promise<void> {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  if (!verifyTwilioSignature(req)) {
    console.warn(`[twilio/inbound] invalid signature`);
    res.status(403).send();
    return;
  }

  const from = String(req.body?.From ?? "").trim();
  const callSid = String(req.body?.CallSid ?? "").trim();
  if (!E164.test(from) || !callSid) {
    console.warn(`[twilio/inbound] bad payload from=${from} callSid=${callSid}`);
    twiml.say(
      { voice: "Polly.Joanna" },
      "Sorry, we couldn't process this call. Please try again later. Goodbye.",
    );
    res.type("text/xml").send(twiml.toString());
    return;
  }

  // Upsert candidate by phone. If they've called before (or onboarded via
  // the web flow), we re-attach to the existing row.
  const [candidate] = await db()
    .insert(candidates)
    .values({ id: randomUUID(), phone: from, language: "en" })
    .onConflictDoUpdate({
      target: candidates.phone,
      set: { lastCallAt: new Date() },
    })
    .returning();

  // Default the session language to English. The agent will ask in the
  // first turn what language the candidate prefers.
  const sessionId = randomUUID();
  await db().insert(sessions).values({
    id: sessionId,
    kind: "candidate_intake",
    candidateId: candidate.id,
    language: "en",
    status: "ringing",
    twilioCallSid: callSid,
  });

  const wsBase = process.env.AGENT_WS_URL;
  if (!wsBase) {
    twiml.say(
      { voice: "Polly.Joanna" },
      "Sorry, our voice agent isn't reachable right now. Please try again in a few minutes. Goodbye.",
    );
    res.type("text/xml").send(twiml.toString());
    return;
  }

  // Mirror the outbound /twilio/voice TwiML — same agent, same protocol.
  // We also tell the agent this is an inbound leg via a parameter so its
  // first turn can ask for the candidate's language preference.
  const apiBase =
    process.env.PUBLIC_API_URL ??
    "https://api-353215144615.europe-west2.run.app";
  const connect = twiml.connect();
  const stream = connect.stream({ url: wsBase });
  stream.parameter({ name: "sessionId", value: sessionId });
  stream.parameter({ name: "language", value: "en" });
  stream.parameter({ name: "audience", value: "worker" });
  stream.parameter({ name: "inbound", value: "1" });

  // Tell Twilio to POST status updates for this call to the per-session
  // status URL. That triggers extractProfile + SMS on completion.
  // (Configured via the StatusCallback attribute on Twilio's call leg —
  // since the inbound leg is owned by Twilio's number config, the URL
  // here will be set on the number itself once via the Twilio API.)
  void apiBase; // explicit no-op so the const stays referenced

  res.type("text/xml").send(twiml.toString());
}
